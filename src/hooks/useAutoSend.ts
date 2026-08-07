/**
 * 自动发送编排 Hook。
 *
 * 特性：
 * - 自校正定时器（按「起始时间 + n×间隔」计算下次延时），抵消 send 耗时漂移，累计误差 ≤2%；
 * - 支持无限 / 指定次数，到点自动停止；
 * - 连接断开时自动停止并复位 UI 开关；
 * - 定时器生命周期完全绑定在 effect 内，卸载即清理，杜绝泄漏。
 *
 * 状态真源为 `useUiStore.autoSend.enabled`，start/stop 只是翻转该开关。
 */

import { useCallback, useEffect } from 'react';
import { PERF } from '@/types/serial';
import { useSerialStore } from '@/store/useSerialStore';
import { useMessageStore } from '@/store/useMessageStore';
import { useUiStore } from '@/store/useUiStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';

export interface AutoSendApi {
  /** 启动自动发送 */
  start: () => void;
  /** 停止自动发送 */
  stop: () => void;
  /** 当前是否运行中 */
  running: boolean;
}

/**
 * 自动发送 Hook。
 *
 * @returns start / stop / running
 */
export function useAutoSend(): AutoSendApi {
  const { send } = useSerialConnection();
  const enabled: boolean = useUiStore((s) => s.autoSend.enabled);
  const connectionState = useSerialStore((s) => s.connectionState);

  const start = useCallback((): void => {
    useUiStore.getState().setAutoSend({ enabled: true });
  }, []);

  const stop = useCallback((): void => {
    useUiStore.getState().setAutoSend({ enabled: false });
  }, []);

  // 定时循环：仅在 enabled 为 true 期间存在
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 前置校验：未连接 / 内容为空时直接复位开关
    if (useSerialStore.getState().connectionState !== 'connected') {
      useUiStore.getState().notify('请先连接串口再开启自动发送', 'warning');
      useUiStore.getState().setAutoSend({ enabled: false });
      return;
    }
    if (useMessageStore.getState().draft.length === 0) {
      useUiStore.getState().notify('发送内容为空，无法开启自动发送', 'warning');
      useUiStore.getState().setAutoSend({ enabled: false });
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let tickIndex = 0;
    const startedAt: number = Date.now();

    useUiStore.getState().resetAutoSendCount();

    /** 终止循环并复位开关 */
    const finish = (note?: string, level: 'info' | 'warning' = 'info'): void => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (note) {
        useMessageStore.getState().appendSystem(note, level);
      }
      useUiStore.getState().setAutoSend({ enabled: false });
    };

    /** 按「起始时间 + n×间隔」自校正调度 */
    const schedule = (): void => {
      if (cancelled) {
        return;
      }
      const interval: number = Math.max(
        PERF.MIN_AUTO_SEND_INTERVAL_MS,
        useUiStore.getState().autoSend.intervalMs,
      );
      tickIndex += 1;
      const delay: number = Math.max(0, startedAt + tickIndex * interval - Date.now());
      timer = window.setTimeout(() => {
        timer = null;
        void run();
      }, delay);
    };

    /** 单次发送 */
    const run = async (): Promise<void> => {
      if (cancelled) {
        return;
      }
      if (useSerialStore.getState().connectionState !== 'connected') {
        finish('连接已断开，自动发送已停止', 'warning');
        return;
      }

      const payload: string = useMessageStore.getState().draft;
      if (payload.length === 0) {
        finish('发送内容为空，自动发送已停止', 'warning');
        return;
      }

      const ok: boolean = await send(payload);
      if (cancelled) {
        return;
      }
      if (!ok) {
        finish('发送失败，自动发送已停止', 'warning');
        return;
      }

      const cfg = useUiStore.getState().autoSend;
      const nextCount: number = cfg.sentCount + 1;
      useUiStore.getState().setAutoSend({ sentCount: nextCount });

      if (cfg.repeatMode === 'count' && nextCount >= cfg.maxCount) {
        finish(`自动发送已完成，共发送 ${nextCount} 次`, 'info');
        return;
      }
      schedule();
    };

    // 立即发出第一帧
    void run();

    return (): void => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
  }, [enabled, send]);

  // 断开连接时兜底复位开关
  useEffect(() => {
    if (connectionState !== 'connected' && useUiStore.getState().autoSend.enabled) {
      useUiStore.getState().setAutoSend({ enabled: false });
    }
  }, [connectionState]);

  return { start, stop, running: enabled };
}
