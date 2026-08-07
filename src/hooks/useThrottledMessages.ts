/**
 * 消息列表节流订阅：把高频的 Store 变更合并为 60ms 一次的 UI 刷新，
 * 避免 10ms 级数据流打爆 React 渲染（系统设计 §8.6）。
 */

import { useEffect, useRef, useState } from 'react';
import { PERF, type MessageRecord } from '@/types/serial';
import { useMessageStore } from '@/store/useMessageStore';

/**
 * 返回节流后的消息快照。
 *
 * @param intervalMs 刷新间隔，默认 60ms
 * @returns 消息数组（引用在每次批量刷新时变化）
 */
export function useThrottledMessages(intervalMs: number = PERF.UI_THROTTLE_MS): MessageRecord[] {
  const [snapshot, setSnapshot] = useState<MessageRecord[]>(
    () => useMessageStore.getState().messages,
  );
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    /** 提交最新快照 */
    const flush = (): void => {
      timerRef.current = null;
      setSnapshot(useMessageStore.getState().messages);
    };

    const unsubscribe = useMessageStore.subscribe((state, prev) => {
      if (state.messages === prev.messages) {
        return;
      }
      // 清空操作立即生效，提升交互反馈
      if (state.messages.length === 0) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setSnapshot(state.messages);
        return;
      }
      if (timerRef.current !== null) {
        return;
      }
      timerRef.current = window.setTimeout(flush, intervalMs);
    });

    // 挂载时先同步一次，避免错过订阅前的数据
    setSnapshot(useMessageStore.getState().messages);

    return (): void => {
      unsubscribe();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [intervalMs]);

  return snapshot;
}
