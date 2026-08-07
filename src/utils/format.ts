/**
 * 展示层格式化工具（纯函数）。
 * 依赖方向：utils → { types }，此处额外依赖同层的 hex / codec（同层互相引用允许，无环）。
 */

import type { DisplayOptions, MessageRecord } from '@/types/serial';
import { bytesToHex } from '@/utils/hex';
import { decodePrintable } from '@/utils/codec';

/**
 * 数字补零。
 *
 * @param value 数值
 * @param width 目标宽度，默认 2
 */
function pad(value: number, width: number = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * 时间戳 → `HH:mm:ss.SSS`（本地时间）。
 *
 * @param ts Date.now() 毫秒时间戳
 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * 时间戳 → `YYYY-MM-DD HH:mm:ss.SSS`（用于导出文件头）。
 *
 * @param ts 毫秒时间戳
 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

/**
 * 时间戳 → `YYYYMMDD-HHmmss`（用于导出文件名）。
 *
 * @param ts 毫秒时间戳
 */
export function formatFileStamp(ts: number): string {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/**
 * 当前时钟 `HH:mm:ss`（状态栏用）。
 *
 * @param ts 毫秒时间戳
 */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 字节数人性化，如 `1.2 KB`。
 *
 * @param n 字节数
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return '0 B';
  }
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 时长格式化，如 `01:23:45` 或 `05:12`。
 *
 * @param ms 毫秒
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '00:00';
  }
  const total: number = Math.floor(ms / 1000);
  const h: number = Math.floor(total / 3600);
  const m: number = Math.floor((total % 3600) / 60);
  const s: number = total % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 方向前缀，用于消息行与导出文本 */
export const DIRECTION_PREFIX: Record<MessageRecord['direction'], string> = {
  tx: '发送',
  rx: '接收',
  system: '系统',
};

/**
 * 把一条消息渲染为单行文本（不含时间戳前缀）。
 * 显示形态完全由 raw 字节 + DisplayOptions 投影得出，
 * 因此切换 ASCII/HEX 后历史消息会自动同步刷新。
 *
 * @param m 消息记录
 * @param opt 显示选项
 * @returns 展示文本
 */
export function renderMessageBody(m: MessageRecord, opt: DisplayOptions): string {
  if (m.direction === 'system') {
    return m.note ?? '';
  }
  if (opt.displayMode === 'hex') {
    return bytesToHex(m.raw);
  }
  const text: string = decodePrintable(m.raw, opt.encoding);
  // 单行展示：把换行折叠为可见符号，保持列表行高固定
  return text.replace(/\r\n|\r|\n/g, '⏎');
}

/**
 * 渲染完整消息行（含可选时间戳与方向标记）。
 *
 * @param m 消息记录
 * @param opt 显示选项
 * @returns 完整行文本
 */
export function renderMessage(m: MessageRecord, opt: DisplayOptions): string {
  const parts: string[] = [];
  if (opt.showTimestamp) {
    parts.push(`[${formatTime(m.timestamp)}]`);
  }
  parts.push(`${DIRECTION_PREFIX[m.direction]}`);
  const body: string = renderMessageBody(m, opt);
  parts.push(body);
  return parts.join(' ');
}

/**
 * 端口/波特率等参数摘要，如 `115200-8-N-1`。
 *
 * @param baudRate 波特率
 * @param dataBits 数据位
 * @param parity 校验
 * @param stopBits 停止位
 */
export function formatConfigSummary(
  baudRate: number,
  dataBits: number,
  parity: string,
  stopBits: number,
): string {
  const parityChar: string = parity === 'none' ? 'N' : parity === 'even' ? 'E' : 'O';
  return `${baudRate}-${dataBits}-${parityChar}-${stopBits}`;
}
