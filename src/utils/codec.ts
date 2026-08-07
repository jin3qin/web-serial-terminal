/**
 * 文本 ↔ 字节 转换唯一入口（系统设计 §8.1 / D5）。
 *
 * - UTF-8：编解码均走浏览器原生；
 * - GBK 解码：浏览器原生 `TextDecoder('gbk')` 直接支持；
 * - GBK 编码：浏览器 `TextEncoder` 只能输出 UTF-8，故动态 import 懒加载码表库；
 *   加载失败时降级为 UTF-8 并返回告警（不抛异常打断发送流程）。
 *
 * 禁止任何组件内直接 `new TextEncoder()` / `new TextDecoder()`。
 */

import { SerialError, type TextEncodingName } from '@/types/serial';

/** 编码结果，包含降级信息供 UI 提示 */
export interface EncodeResult {
  bytes: Uint8Array;
  /** 实际使用的编码 */
  encoding: TextEncodingName;
  /** 是否发生了降级（请求 GBK 但实际用了 UTF-8） */
  degraded: boolean;
  /** 降级或异常时的中文告警文案 */
  warning?: string;
}

/** GBK 编码器函数签名 */
type GbkEncodeFn = (text: string) => Uint8Array;

const utf8Encoder: TextEncoder = new TextEncoder();

/** 解码器缓存，避免高频创建 */
const decoderCache = new Map<string, TextDecoder>();

/** GBK 编码器缓存与加载状态 */
let gbkEncoder: GbkEncodeFn | null = null;
let gbkLoading: Promise<GbkEncodeFn | null> | null = null;
let gbkLoadFailed = false;

/**
 * 获取（并缓存）指定编码的解码器。
 * 若浏览器不支持该编码，降级为 utf-8 解码器。
 *
 * @param encoding 编码名
 */
function getDecoder(encoding: TextEncodingName): TextDecoder {
  const key: string = encoding;
  const cached: TextDecoder | undefined = decoderCache.get(key);
  if (cached) {
    return cached;
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: false });
  } catch {
    decoder = new TextDecoder('utf-8', { fatal: false });
  }
  decoderCache.set(key, decoder);
  return decoder;
}

/**
 * 把第三方库的返回值归一化成 Uint8Array。
 *
 * @param value 库返回的编码结果
 * @returns Uint8Array，无法识别时返回 null
 */
function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
    return Uint8Array.from(value as number[]);
  }
  return null;
}

/**
 * 从动态 import 的模块对象中解析出 encode 函数。
 *
 * @param mod 动态导入的模块
 * @returns 归一化后的编码函数，解析失败返回 null
 */
function resolveGbkEncode(mod: unknown): GbkEncodeFn | null {
  const candidates: unknown[] = [];
  const record = mod as Record<string, unknown> | null;
  if (record) {
    candidates.push(record.encode);
    const def = record.default as Record<string, unknown> | undefined;
    if (def) {
      candidates.push(def.encode);
      candidates.push(def);
    }
  }
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      const fn = candidate as (text: string) => unknown;
      return (text: string): Uint8Array => {
        const raw: unknown = fn(text);
        const bytes: Uint8Array | null = toUint8Array(raw);
        if (!bytes) {
          throw new SerialError('E_ENCODE_FAILED', 'GBK 编码库返回了无法识别的数据结构');
        }
        return bytes;
      };
    }
  }
  return null;
}

/**
 * 懒加载 GBK 编码器（幂等，并发安全）。
 * 只在用户真正选择 GBK 编码发送时才触发，未选择则零成本。
 *
 * @returns 编码函数；加载失败返回 null（调用方自行降级）
 */
export async function loadGbkEncoder(): Promise<GbkEncodeFn | null> {
  if (gbkEncoder) {
    return gbkEncoder;
  }
  if (gbkLoadFailed) {
    return null;
  }
  if (gbkLoading) {
    return gbkLoading;
  }

  gbkLoading = (async (): Promise<GbkEncodeFn | null> => {
    try {
      // 动态 import：Vite 会自动分包，未选择 GBK 时不会加载此 chunk
      const mod: unknown = await import('gbk.js');
      const fn: GbkEncodeFn | null = resolveGbkEncode(mod);
      if (!fn) {
        gbkLoadFailed = true;
        return null;
      }
      gbkEncoder = fn;
      return fn;
    } catch {
      gbkLoadFailed = true;
      return null;
    } finally {
      gbkLoading = null;
    }
  })();

  return gbkLoading;
}

/** GBK 编码器是否已就绪（用于同步编码路径判断） */
export function isGbkEncoderReady(): boolean {
  return gbkEncoder !== null;
}

/**
 * 文本 → 字节（同步版本，符合类图签名）。
 *
 * 注意：GBK 编码依赖懒加载库，若尚未加载完成会**静默降级**为 UTF-8。
 * 需要可靠 GBK 编码时请使用 {@link encodeTextAsync}。
 *
 * @param text 文本
 * @param encoding 目标编码，默认 utf-8
 * @returns 字节
 */
export function encodeText(text: string, encoding: TextEncodingName = 'utf-8'): Uint8Array {
  if (encoding === 'gbk' && gbkEncoder) {
    try {
      return gbkEncoder(text);
    } catch {
      return utf8Encoder.encode(text);
    }
  }
  return utf8Encoder.encode(text);
}

/**
 * 文本 → 字节（异步版本，会在需要时懒加载 GBK 码表）。
 * 这是 hooks 编排层的推荐入口。
 *
 * @param text 文本
 * @param encoding 目标编码，默认 utf-8
 * @returns EncodeResult，含降级标记与告警文案
 */
export async function encodeTextAsync(
  text: string,
  encoding: TextEncodingName = 'utf-8',
): Promise<EncodeResult> {
  if (encoding !== 'gbk') {
    return { bytes: utf8Encoder.encode(text), encoding: 'utf-8', degraded: false };
  }

  const fn: GbkEncodeFn | null = await loadGbkEncoder();
  if (!fn) {
    return {
      bytes: utf8Encoder.encode(text),
      encoding: 'utf-8',
      degraded: true,
      warning: 'GBK 编码组件加载失败，已降级为 UTF-8 发送',
    };
  }
  try {
    return { bytes: fn(text), encoding: 'gbk', degraded: false };
  } catch {
    return {
      bytes: utf8Encoder.encode(text),
      encoding: 'utf-8',
      degraded: true,
      warning: 'GBK 编码执行失败，已降级为 UTF-8 发送',
    };
  }
}

/**
 * 字节 → 文本。GBK/UTF-8 均走浏览器原生解码器。
 *
 * @param bytes 字节
 * @param encoding 源编码，默认 utf-8
 * @returns 解码后的文本（非法序列以 U+FFFD 替代，不抛异常）
 */
export function decodeText(bytes: Uint8Array, encoding: TextEncodingName = 'utf-8'): string {
  if (bytes.length === 0) {
    return '';
  }
  try {
    return getDecoder(encoding).decode(bytes);
  } catch {
    return getDecoder('utf-8').decode(bytes);
  }
}

/**
 * 解码为「可打印文本」：把控制字符（除 \r \n \t 外）替换为 `·`，
 * 避免终端控制码破坏消息列表排版。
 *
 * @param bytes 字节
 * @param encoding 源编码
 * @returns 适合单行展示的文本
 */
export function decodePrintable(bytes: Uint8Array, encoding: TextEncodingName = 'utf-8'): string {
  const text: string = decodeText(bytes, encoding);
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '·');
}
