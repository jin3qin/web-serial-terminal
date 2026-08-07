/**
 * 日志导出：消息列表 → txt 文本 → Blob 下载。
 * 导出内容与界面所见一致（遵循当前 DisplayOptions 的时间戳与 ASCII/HEX 形态）。
 */

import type { DisplayOptions, MessageRecord } from '@/types/serial';
import { formatDateTime, formatFileStamp, renderMessage } from '@/utils/format';

/** 导出选项 */
export interface ExportOptions {
  /** 显示选项，决定时间戳与 ASCII/HEX 形态 */
  display: DisplayOptions;
  /** 文件名前缀，默认 serial-log */
  prefix?: string;
  /** 是否写入文件头（导出时间、条数、配置摘要） */
  withHeader?: boolean;
  /** 文件头中附带的串口参数摘要，例如 `COM3 · 115200-8-N-1` */
  headerNote?: string;
}

/**
 * 生成导出文件名：`serial-log-YYYYMMDD-HHmmss.txt`。
 *
 * @param prefix 文件名前缀
 * @param ts 时间戳，默认当前时间
 */
export function buildFileName(prefix: string = 'serial-log', ts: number = Date.now()): string {
  return `${prefix}-${formatFileStamp(ts)}.txt`;
}

/**
 * 将消息列表序列化为 txt 文本。
 *
 * @param list 消息列表
 * @param opt 导出选项
 * @returns 完整文本内容
 */
export function buildTxt(list: readonly MessageRecord[], opt: ExportOptions): string {
  const lines: string[] = [];
  if (opt.withHeader !== false) {
    lines.push('==============================================');
    lines.push(' 网页版串口调试工具 · 日志导出');
    lines.push(` 导出时间：${formatDateTime(Date.now())}`);
    lines.push(` 消息条数：${list.length}`);
    lines.push(` 显示模式：${opt.display.displayMode === 'hex' ? 'HEX' : 'ASCII'} / ${opt.display.encoding.toUpperCase()}`);
    if (opt.headerNote) {
      lines.push(` 串口参数：${opt.headerNote}`);
    }
    lines.push('==============================================');
    lines.push('');
  }
  for (const m of list) {
    lines.push(renderMessage(m, opt.display));
  }
  lines.push('');
  return lines.join('\r\n');
}

/**
 * 触发浏览器下载。
 *
 * @param content 文本内容
 * @param fileName 文件名
 */
export function downloadText(content: string, fileName: string): void {
  // 加 BOM，避免 Windows 记事本打开中文乱码
  const blob = new Blob(['\uFEFF', content], { type: 'text/plain;charset=utf-8' });
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // 延迟释放，兼容部分浏览器的异步下载
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 导出消息列表为 txt 文件。
 *
 * @param list 消息列表
 * @param opt 导出选项
 * @returns 生成的文件名
 */
export function exportTxt(list: readonly MessageRecord[], opt: ExportOptions): string {
  const fileName: string = buildFileName(opt.prefix ?? 'serial-log');
  downloadText(buildTxt(list, opt), fileName);
  return fileName;
}
