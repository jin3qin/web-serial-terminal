/**
 * HEX 转换唯一入口（系统设计 §8.1）。
 *
 * 禁止任何组件/服务内自行 `toString(16)`。
 * 输出统一：大写 + 单空格分隔，例如 `AA BB CC`。
 * 输入容错：`AABB` / `AA BB` / `0xAA,0xBB` / 含换行制表符均可，奇数位报 E_INVALID_HEX。
 */

import { SerialError } from '@/types/serial';

/** 预生成 00-FF 的大写十六进制表，避免运行时反复 padStart */
const HEX_TABLE: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).toUpperCase().padStart(2, '0'),
);

/**
 * 归一化 HEX 输入：去掉 0x/0X 前缀、逗号、分号、空白（含换行/制表）。
 *
 * @param input 原始输入
 * @returns 仅含十六进制字符（可能仍非法）的紧凑大写字符串
 */
export function normalizeHexInput(input: string): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/0[xX]/g, '')
    .replace(/[\s,;:_\-]+/g, '')
    .toUpperCase();
}

/**
 * 校验 HEX 输入是否合法（空字符串视为不合法，因为无内容可发送）。
 *
 * @param input 原始输入
 * @returns 合法返回 true
 */
export function isValidHex(input: string): boolean {
  const cleaned: string = normalizeHexInput(input);
  if (cleaned.length === 0) {
    return false;
  }
  if (cleaned.length % 2 !== 0) {
    return false;
  }
  return /^[0-9A-F]+$/.test(cleaned);
}

/**
 * 返回 HEX 输入的具体错误说明，合法时返回空字符串。
 * 供输入框内联红字提示使用（不弹窗）。
 *
 * @param input 原始输入
 * @returns 中文错误说明或空串
 */
export function describeHexError(input: string): string {
  const cleaned: string = normalizeHexInput(input);
  if (cleaned.length === 0) {
    return input.trim().length === 0 ? '' : 'HEX 内容为空';
  }
  if (!/^[0-9A-F]*$/.test(cleaned)) {
    const bad: string[] = Array.from(new Set(cleaned.split('').filter((c) => !/[0-9A-F]/.test(c))));
    return `包含非法字符：${bad.join(' ')}`;
  }
  if (cleaned.length % 2 !== 0) {
    return `HEX 位数必须为偶数（当前 ${cleaned.length} 位）`;
  }
  return '';
}

/**
 * HEX 字符串 → 字节数组。
 *
 * @param input 原始输入，支持 `AA bb 0xCc` 等容错写法
 * @returns Uint8Array
 * @throws SerialError E_INVALID_HEX 非法字符或奇数位
 */
export function hexToBytes(input: string): Uint8Array {
  const cleaned: string = normalizeHexInput(input);
  if (cleaned.length === 0) {
    throw new SerialError('E_INVALID_HEX', 'HEX 格式不正确：内容为空');
  }
  if (!/^[0-9A-F]+$/.test(cleaned)) {
    throw new SerialError('E_INVALID_HEX', `HEX 格式不正确：${describeHexError(input)}`);
  }
  if (cleaned.length % 2 !== 0) {
    throw new SerialError('E_INVALID_HEX', `HEX 格式不正确：位数必须为偶数（当前 ${cleaned.length} 位）`);
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * 字节数组 → HEX 字符串（大写）。
 *
 * @param bytes 字节
 * @param sep 分隔符，默认单空格
 * @returns 例如 `AA BB CC`
 */
export function bytesToHex(bytes: Uint8Array, sep: string = ' '): string {
  if (bytes.length === 0) {
    return '';
  }
  const parts: string[] = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    parts[i] = HEX_TABLE[bytes[i]];
  }
  return parts.join(sep);
}

/**
 * 单字节 → 两位大写 HEX。
 *
 * @param byte 0-255（越界自动取低 8 位）
 */
export function byteToHex(byte: number): string {
  return HEX_TABLE[byte & 0xff];
}

/**
 * 将字节按每行 N 个格式化为多行 HEX 块。
 *
 * @param bytes 字节
 * @param perLine 每行字节数，默认 16
 * @returns 多行字符串（\n 分隔）
 */
export function formatHexBlock(bytes: Uint8Array, perLine: number = 16): string {
  if (bytes.length === 0) {
    return '';
  }
  const step: number = perLine > 0 ? Math.floor(perLine) : 16;
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += step) {
    lines.push(bytesToHex(bytes.subarray(i, Math.min(i + step, bytes.length))));
  }
  return lines.join('\n');
}

/**
 * 将多段字节合并为一段（用于合帧与导出）。
 *
 * @param chunks 字节片段列表
 * @returns 合并后的新 Uint8Array
 */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) {
    total += c.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
