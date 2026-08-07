/**
 * `@/utils/codec` 单元测试。
 *
 * 覆盖系统设计 D5 与 T02 验收点 3：
 * - UTF-8 编解码往返；
 * - GBK 解码走浏览器/Node 原生；
 * - GBK 编码走懒加载（mock `gbk.js`），"中" → D6 D0；
 * - 加载失败 / 返回结构非法 / 执行抛错 三种降级路径。
 *
 * 注意：codec 内部有模块级缓存（gbkEncoder / gbkLoadFailed），
 * 因此每个 GBK 用例都必须 `vi.resetModules()` 后动态 import，避免跨用例污染。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToHex } from '@/utils/hex';
import { decodePrintable, decodeText, encodeText, encodeTextAsync } from '@/utils/codec';

/** 宿主是否支持原生 GBK 解码（Node 需 full-icu） */
const HAS_GBK_DECODER: boolean = ((): boolean => {
  try {
    return new TextDecoder('gbk').encoding === 'gbk';
  } catch {
    return false;
  }
})();

describe('UTF-8 编解码', () => {
  it.each([
    ['hello'],
    ['你好，世界'],
    ['mixed 中英文 123 !@#'],
    ['emoji 😀🚀'],
    [''],
  ])('往返一致：%j', (text) => {
    const bytes: Uint8Array = encodeText(text, 'utf-8');
    expect(decodeText(bytes, 'utf-8')).toBe(text);
  });

  it('默认编码为 utf-8', () => {
    expect(Array.from(encodeText('A'))).toEqual([0x41]);
    expect(decodeText(Uint8Array.from([0x41]))).toBe('A');
  });

  it('"中" 的 UTF-8 是 E4 B8 AD', () => {
    expect(bytesToHex(encodeText('中', 'utf-8'))).toBe('E4 B8 AD');
  });

  it('空字节数组解码为空串', () => {
    expect(decodeText(new Uint8Array(0), 'utf-8')).toBe('');
    expect(decodeText(new Uint8Array(0), 'gbk')).toBe('');
  });

  it('非法 UTF-8 序列不抛异常，替换为 U+FFFD', () => {
    const broken = Uint8Array.from([0xff, 0xfe, 0x41]);
    expect(() => decodeText(broken, 'utf-8')).not.toThrow();
    expect(decodeText(broken, 'utf-8')).toContain('A');
  });

  it('encodeText 返回 Uint8Array', () => {
    expect(encodeText('x')).toBeInstanceOf(Uint8Array);
  });
});

describe('GBK 解码（原生）', () => {
  it.runIf(HAS_GBK_DECODER)('D6 D0 → "中"', () => {
    expect(decodeText(Uint8Array.from([0xd6, 0xd0]), 'gbk')).toBe('中');
  });

  it.runIf(HAS_GBK_DECODER)('GBK 多字中文解码', () => {
    // "你好" 的 GBK 编码为 C4 E3 BA C3
    expect(decodeText(Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]), 'gbk')).toBe('你好');
  });

  it('ASCII 在 GBK 下与 UTF-8 等价', () => {
    expect(decodeText(Uint8Array.from([0x41, 0x42]), 'gbk')).toBe('AB');
  });
});

describe('decodePrintable', () => {
  it('保留 \\r \\n \\t，其余控制字符替换为 ·', () => {
    const bytes = Uint8Array.from([0x41, 0x00, 0x09, 0x0a, 0x0d, 0x1b, 0x7f, 0x42]);
    expect(decodePrintable(bytes, 'utf-8')).toBe('A·\t\n\r··B');
  });

  it('普通文本原样返回', () => {
    expect(decodePrintable(encodeText('hello 中文'), 'utf-8')).toBe('hello 中文');
  });
});

describe('GBK 编码（懒加载 + 降级）', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('加载成功：encodeTextAsync("中","gbk") → D6 D0，不降级', async () => {
    vi.doMock('gbk.js', () => ({
      encode: (text: string): Uint8Array =>
        text === '中' ? Uint8Array.from([0xd6, 0xd0]) : Uint8Array.from([0x3f]),
    }));
    const codec = await import('@/utils/codec');

    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.degraded).toBe(false);
    expect(result.encoding).toBe('gbk');
    expect(result.warning).toBeUndefined();
    expect(bytesToHex(result.bytes)).toBe('D6 D0');
  });

  it('支持 default 导出形态的库', async () => {
    vi.doMock('gbk.js', () => ({
      default: { encode: (): Uint8Array => Uint8Array.from([0xd6, 0xd0]) },
    }));
    const codec = await import('@/utils/codec');
    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.encoding).toBe('gbk');
    expect(bytesToHex(result.bytes)).toBe('D6 D0');
  });

  it('库返回 number[] 时自动归一化为 Uint8Array', async () => {
    vi.doMock('gbk.js', () => ({ encode: (): number[] => [0xd6, 0xd0] }));
    const codec = await import('@/utils/codec');
    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(bytesToHex(result.bytes)).toBe('D6 D0');
  });

  it('懒加载幂等：多次调用只 import 一次', async () => {
    const encodeSpy = vi.fn((): Uint8Array => Uint8Array.from([0xd6, 0xd0]));
    const factory = vi.fn(() => ({ encode: encodeSpy }));
    vi.doMock('gbk.js', factory);
    const codec = await import('@/utils/codec');

    expect(codec.isGbkEncoderReady()).toBe(false);
    await Promise.all([codec.loadGbkEncoder(), codec.loadGbkEncoder(), codec.loadGbkEncoder()]);
    expect(codec.isGbkEncoderReady()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('模块加载失败 → 降级 UTF-8 并带告警', async () => {
    vi.doMock('gbk.js', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const codec = await import('@/utils/codec');

    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.degraded).toBe(true);
    expect(result.encoding).toBe('utf-8');
    expect(result.warning).toContain('降级');
    expect(bytesToHex(result.bytes)).toBe('E4 B8 AD');
  });

  it('模块无 encode 函数 → 降级 UTF-8', async () => {
    vi.doMock('gbk.js', () => ({ somethingElse: 1 }));
    const codec = await import('@/utils/codec');

    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.degraded).toBe(true);
    expect(result.encoding).toBe('utf-8');
    expect(result.warning).toContain('加载失败');
  });

  it('encode 返回无法识别结构 → 执行失败降级', async () => {
    vi.doMock('gbk.js', () => ({ encode: (): string => 'not-bytes' }));
    const codec = await import('@/utils/codec');

    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.degraded).toBe(true);
    expect(result.encoding).toBe('utf-8');
    expect(result.warning).toContain('执行失败');
  });

  it('encode 抛异常 → 执行失败降级', async () => {
    vi.doMock('gbk.js', () => ({
      encode: (): Uint8Array => {
        throw new Error('boom');
      },
    }));
    const codec = await import('@/utils/codec');

    const result = await codec.encodeTextAsync('中', 'gbk');
    expect(result.degraded).toBe(true);
    expect(result.warning).toContain('执行失败');
  });

  it('加载失败后不再重复尝试 import', async () => {
    const factory = vi.fn(() => {
      throw new Error('offline');
    });
    vi.doMock('gbk.js', factory);
    const codec = await import('@/utils/codec');

    await codec.encodeTextAsync('中', 'gbk');
    await codec.encodeTextAsync('文', 'gbk');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('encoding 非 gbk 时不触发任何懒加载', async () => {
    const factory = vi.fn(() => ({ encode: (): Uint8Array => new Uint8Array(0) }));
    vi.doMock('gbk.js', factory);
    const codec = await import('@/utils/codec');

    const result = await codec.encodeTextAsync('中', 'utf-8');
    expect(result.encoding).toBe('utf-8');
    expect(result.degraded).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it('同步 encodeText 在编码器未就绪时静默降级 UTF-8', async () => {
    vi.doMock('gbk.js', () => ({ encode: (): Uint8Array => Uint8Array.from([0xd6, 0xd0]) }));
    const codec = await import('@/utils/codec');

    // 未 await loadGbkEncoder 之前
    expect(bytesToHex(codec.encodeText('中', 'gbk'))).toBe('E4 B8 AD');

    await codec.loadGbkEncoder();
    expect(bytesToHex(codec.encodeText('中', 'gbk'))).toBe('D6 D0');
  });

  it('同步 encodeText 在编码器抛错时兜底 UTF-8', async () => {
    let shouldThrow = false;
    vi.doMock('gbk.js', () => ({
      encode: (): Uint8Array => {
        if (shouldThrow) {
          throw new Error('boom');
        }
        return Uint8Array.from([0xd6, 0xd0]);
      },
    }));
    const codec = await import('@/utils/codec');
    await codec.loadGbkEncoder();

    shouldThrow = true;
    expect(bytesToHex(codec.encodeText('中', 'gbk'))).toBe('E4 B8 AD');
  });
});

describe('GBK 往返（编码 mock + 原生解码）', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.runIf(HAS_GBK_DECODER)('中文 GBK 编码后可被原生解码器还原', async () => {
    vi.doMock('gbk.js', () => ({
      encode: (text: string): Uint8Array => {
        const table: Record<string, number[]> = { 中: [0xd6, 0xd0], 文: [0xce, 0xc4] };
        const out: number[] = [];
        for (const ch of text) {
          out.push(...(table[ch] ?? [0x3f]));
        }
        return Uint8Array.from(out);
      },
    }));
    const codec = await import('@/utils/codec');
    const { bytes } = await codec.encodeTextAsync('中文', 'gbk');
    expect(bytesToHex(bytes)).toBe('D6 D0 CE C4');
    expect(codec.decodeText(bytes, 'gbk')).toBe('中文');
  });
});
