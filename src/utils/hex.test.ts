/**
 * `@/utils/hex` 单元测试。
 *
 * 覆盖系统设计 §8.1「HEX 唯一入口」与 T02 验收点 1/2：
 * - `hexToBytes('AA bb 0xCc')` → [0xAA,0xBB,0xCC]
 * - `hexToBytes('ABC')` / `'ZZ'` 抛 E_INVALID_HEX
 * - `bytesToHex` 大写 + 单空格
 * - `isValidHex` 边界、奇数位报错
 */

import { describe, expect, it } from 'vitest';
import {
  byteToHex,
  bytesToHex,
  concatBytes,
  describeHexError,
  formatHexBlock,
  hexToBytes,
  isValidHex,
  normalizeHexInput,
} from '@/utils/hex';
import { SerialError } from '@/types/serial';

describe('normalizeHexInput', () => {
  it.each([
    ['AABB', 'AABB'],
    ['aa bb', 'AABB'],
    ['0xAA,0xBB', 'AABB'],
    ['0XAA;0Xbb', 'AABB'],
    ['AA\nBB\tCC', 'AABBCC'],
    ['AA-BB_CC:DD', 'AABBCCDD'],
    ['   ', ''],
    ['', ''],
  ])('归一化 %j → %j', (input, expected) => {
    expect(normalizeHexInput(input)).toBe(expected);
  });
});

describe('isValidHex', () => {
  it.each([
    ['AA', true],
    ['aa bb', true],
    ['0xAA 0xBB', true],
    ['0102030405060708090A0B0C0D0E0F', false], // 30 位，奇数
    ['00', true],
    ['FF', true],
    ['ABC', false], // 奇数位
    ['ZZ', false], // 非法字符
    ['GG', false], // G 不是十六进制
    ['', false], // 空内容视为不合法
    ['   ', false],
    ['0x', false], // 只有前缀
  ])('isValidHex(%j) === %s', (input, expected) => {
    expect(isValidHex(input)).toBe(expected);
  });

  it('偶数位纯十六进制串合法（长报文边界）', () => {
    const long: string = 'AB'.repeat(1024);
    expect(isValidHex(long)).toBe(true);
    expect(hexToBytes(long)).toHaveLength(1024);
  });
});

describe('describeHexError', () => {
  it('空输入返回空串（不打扰用户）', () => {
    expect(describeHexError('')).toBe('');
    expect(describeHexError('   ')).toBe('');
  });

  it('只有分隔符时提示内容为空', () => {
    expect(describeHexError('0x')).toBe('HEX 内容为空');
  });

  it('非法字符时逐一列出', () => {
    expect(describeHexError('ZZ')).toBe('包含非法字符：Z');
    expect(describeHexError('AZQ')).toContain('Z');
    expect(describeHexError('AZQ')).toContain('Q');
  });

  it('奇数位时给出当前位数', () => {
    expect(describeHexError('ABC')).toBe('HEX 位数必须为偶数（当前 3 位）');
  });

  it('合法输入返回空串', () => {
    expect(describeHexError('AA BB')).toBe('');
  });
});

describe('hexToBytes', () => {
  it('T02 验收点 1：混合大小写 / 空格 / 0x 前缀', () => {
    expect(Array.from(hexToBytes('AA bb 0xCc'))).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it.each([
    ['AABB', [0xaa, 0xbb]],
    ['aa bb', [0xaa, 0xbb]],
    ['0xAA,0xBB', [0xaa, 0xbb]],
    ['01 03 00 00 00 01', [0x01, 0x03, 0x00, 0x00, 0x00, 0x01]], // Modbus 读寄存器
    ['00', [0x00]],
    ['ff', [0xff]],
    ['AA\r\nBB', [0xaa, 0xbb]],
  ])('解析 %j', (input, expected) => {
    expect(Array.from(hexToBytes(input))).toEqual(expected);
  });

  it('返回值必须是 Uint8Array（字节为唯一事实来源）', () => {
    expect(hexToBytes('AA')).toBeInstanceOf(Uint8Array);
  });

  it.each([
    ['ABC', '奇数位'],
    ['ZZ', '非法字符'],
    ['GG', '非十六进制字母'],
    ['', '空内容'],
    ['   ', '仅空白'],
    ['0x', '仅前缀'],
    ['AA BB C', '尾部半字节'],
  ])('非法输入 %j（%s）抛 E_INVALID_HEX', (input) => {
    expect(() => hexToBytes(input)).toThrowError(SerialError);
    try {
      hexToBytes(input);
      expect.unreachable('应当抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(SerialError);
      expect((e as SerialError).code).toBe('E_INVALID_HEX');
      // §8.3：HEX 错误属于输入框内联提示，不应是 benign（benign 仅取消选择/主动中止）
      expect((e as SerialError).benign).toBe(false);
    }
  });

  it('非法字符错误信息包含具体字符，便于内联红字提示', () => {
    try {
      hexToBytes('ZZ');
      expect.unreachable('应当抛出异常');
    } catch (e) {
      expect((e as SerialError).message).toContain('Z');
    }
  });
});

describe('bytesToHex', () => {
  it('统一大写 + 单空格分隔', () => {
    expect(bytesToHex(Uint8Array.from([0xaa, 0xbb, 0xcc]))).toBe('AA BB CC');
  });

  it('单字节补零', () => {
    expect(bytesToHex(Uint8Array.from([0x00, 0x01, 0x0f]))).toBe('00 01 0F');
  });

  it('空数组返回空串', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });

  it('支持自定义分隔符', () => {
    expect(bytesToHex(Uint8Array.from([0xde, 0xad]), '')).toBe('DEAD');
    expect(bytesToHex(Uint8Array.from([0xde, 0xad]), '-')).toBe('DE-AD');
  });

  it('与 hexToBytes 往返一致（0x00-0xFF 全量）', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text: string = bytesToHex(all);
    expect(text).toMatch(/^[0-9A-F]{2}( [0-9A-F]{2})*$/);
    expect(Array.from(hexToBytes(text))).toEqual(Array.from(all));
  });
});

describe('byteToHex', () => {
  it.each([
    [0, '00'],
    [1, '01'],
    [15, '0F'],
    [16, '10'],
    [255, 'FF'],
  ])('byteToHex(%i) === %j', (input, expected) => {
    expect(byteToHex(input)).toBe(expected);
  });

  it('越界值自动取低 8 位', () => {
    expect(byteToHex(256)).toBe('00');
    expect(byteToHex(0x1ff)).toBe('FF');
    expect(byteToHex(-1)).toBe('FF');
  });
});

describe('formatHexBlock', () => {
  it('默认每行 16 字节', () => {
    const bytes = Uint8Array.from({ length: 20 }, (_, i) => i);
    const lines: string[] = formatHexBlock(bytes).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].split(' ')).toHaveLength(16);
    expect(lines[1].split(' ')).toHaveLength(4);
  });

  it('支持自定义每行字节数', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
    expect(formatHexBlock(bytes, 2)).toBe('01 02\n03 04\n05');
  });

  it('perLine 非法时回退 16', () => {
    const bytes = Uint8Array.from({ length: 17 }, (_, i) => i);
    expect(formatHexBlock(bytes, 0).split('\n')).toHaveLength(2);
    expect(formatHexBlock(bytes, -5).split('\n')).toHaveLength(2);
  });

  it('空输入返回空串', () => {
    expect(formatHexBlock(new Uint8Array(0))).toBe('');
  });
});

describe('concatBytes', () => {
  it('合并多段字节（合帧场景）', () => {
    const merged: Uint8Array = concatBytes([
      Uint8Array.from([1, 2]),
      Uint8Array.from([3]),
      Uint8Array.from([4, 5, 6]),
    ]);
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('空列表返回空数组', () => {
    expect(concatBytes([])).toHaveLength(0);
  });

  it('不修改输入片段', () => {
    const a = Uint8Array.from([1, 2]);
    const b = Uint8Array.from([3]);
    concatBytes([a, b]);
    expect(Array.from(a)).toEqual([1, 2]);
    expect(Array.from(b)).toEqual([3]);
  });
});
