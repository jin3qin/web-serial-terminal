/**
 * `@/utils/crc` 单元测试。
 *
 * 校验策略：不直接照抄源码实现，而是用**独立的逐位参考实现**重新算一遍再比对，
 * 同时叠加业界公认的 check 向量（"123456789"）与 Modbus 实机报文向量，
 * 避免「实现错了，测试也跟着错」。
 */

import { describe, expect, it } from 'vitest';
import { appendChecksum, checksumHex, crc16Modbus, crc8, sum8, xor8 } from '@/utils/crc';
import { bytesToHex, hexToBytes } from '@/utils/hex';

/* ==========================================================================
 * 独立参考实现（逐位运算，不查表）
 * ========================================================================== */

/** CRC-16/MODBUS 参考实现：poly=0x8005 反转 0xA001，init=0xFFFF，refin/refout=true，xorout=0 */
function refCrc16Modbus(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/** CRC-8/SMBUS 参考实现：poly=0x07，init=0x00，refin/refout=false，xorout=0 */
function refCrc8(bytes: Uint8Array): number {
  let crc = 0x00;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}

const CHECK_VECTOR: Uint8Array = new TextEncoder().encode('123456789');

/** 若干典型报文样本 */
const SAMPLES: readonly Uint8Array[] = [
  new Uint8Array(0),
  Uint8Array.from([0x00]),
  Uint8Array.from([0xff]),
  Uint8Array.from([0x01, 0x03]),
  hexToBytes('01 03 00 00 00 01'),
  hexToBytes('01 06 00 01 00 17'),
  hexToBytes('11 02 00 C4 00 16'),
  CHECK_VECTOR,
  Uint8Array.from({ length: 256 }, (_, i) => i),
];

describe('crc16Modbus', () => {
  it('业界 check 向量："123456789" → 0x4B37', () => {
    expect(crc16Modbus(CHECK_VECTOR)).toBe(0x4b37);
  });

  it('与独立逐位参考实现完全一致（多样本）', () => {
    for (const s of SAMPLES) {
      expect(crc16Modbus(s)).toBe(refCrc16Modbus(s));
    }
  });

  it('空输入返回初始值 0xFFFF', () => {
    expect(crc16Modbus(new Uint8Array(0))).toBe(0xffff);
  });

  it('Modbus RTU 实机向量：01 03 00 00 00 01 追加校验时低字节在前', () => {
    const frame: Uint8Array = hexToBytes('01 03 00 00 00 01');
    const crc: number = crc16Modbus(frame);
    expect(crc).toBe(refCrc16Modbus(frame));
    // 追加后完整帧的最后两字节即 CRC（低字节在前）
    const full: Uint8Array = appendChecksum(frame, 'crc16-modbus');
    expect(full[full.length - 2]).toBe(crc & 0xff);
    expect(full[full.length - 1]).toBe((crc >>> 8) & 0xff);
  });

  it('结果始终在 0x0000-0xFFFF 范围内', () => {
    for (const s of SAMPLES) {
      const v: number = crc16Modbus(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffff);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('对完整帧（含 CRC）再算一次 CRC 应为 0（Modbus 自校验特性）', () => {
    const frame: Uint8Array = hexToBytes('01 03 00 00 00 01');
    const full: Uint8Array = appendChecksum(frame, 'crc16-modbus');
    expect(crc16Modbus(full)).toBe(0x0000);
  });
});

describe('crc8', () => {
  it('业界 check 向量："123456789" → 0xF4（CRC-8/SMBUS）', () => {
    expect(crc8(CHECK_VECTOR)).toBe(0xf4);
  });

  it('与独立逐位参考实现完全一致（多样本）', () => {
    for (const s of SAMPLES) {
      expect(crc8(s)).toBe(refCrc8(s));
    }
  });

  it('空输入返回 0x00', () => {
    expect(crc8(new Uint8Array(0))).toBe(0x00);
  });

  it('结果始终在 0x00-0xFF 范围内', () => {
    for (const s of SAMPLES) {
      const v: number = crc8(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xff);
    }
  });
});

describe('sum8', () => {
  it('普通累加取低 8 位', () => {
    expect(sum8(Uint8Array.from([0x01, 0x02, 0x03]))).toBe(0x06);
  });

  it('溢出回绕', () => {
    expect(sum8(Uint8Array.from([0xff, 0x01]))).toBe(0x00);
    expect(sum8(Uint8Array.from([0xff, 0xff]))).toBe(0xfe);
  });

  it('空输入返回 0', () => {
    expect(sum8(new Uint8Array(0))).toBe(0);
  });

  it('0-255 全量累加 = 32640 & 0xFF = 0x80', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(sum8(all)).toBe(32640 & 0xff);
  });
});

describe('xor8', () => {
  it('普通异或', () => {
    expect(xor8(Uint8Array.from([0x01, 0x02, 0x03]))).toBe(0x00);
    expect(xor8(Uint8Array.from([0xaa, 0x55]))).toBe(0xff);
  });

  it('同一字节出现两次相互抵消', () => {
    expect(xor8(Uint8Array.from([0x5a, 0x5a]))).toBe(0x00);
  });

  it('空输入返回 0', () => {
    expect(xor8(new Uint8Array(0))).toBe(0);
  });
});

describe('appendChecksum', () => {
  it('crc16-modbus 追加 2 字节，低字节在前', () => {
    const src: Uint8Array = hexToBytes('01 03');
    const out: Uint8Array = appendChecksum(src, 'crc16-modbus');
    const crc: number = crc16Modbus(src);
    expect(out).toHaveLength(src.length + 2);
    expect(out[2]).toBe(crc & 0xff);
    expect(out[3]).toBe((crc >>> 8) & 0xff);
  });

  it.each(['crc8', 'sum8', 'xor8'] as const)('%s 追加 1 字节', (algo) => {
    const src: Uint8Array = hexToBytes('01 03 05');
    const out: Uint8Array = appendChecksum(src, algo);
    expect(out).toHaveLength(src.length + 1);
    expect(Array.from(out.subarray(0, 3))).toEqual([0x01, 0x03, 0x05]);
  });

  it('不修改原数组（纯函数）', () => {
    const src: Uint8Array = hexToBytes('01 03');
    appendChecksum(src, 'crc16-modbus');
    expect(bytesToHex(src)).toBe('01 03');
  });

  it('空输入也能正确追加', () => {
    expect(appendChecksum(new Uint8Array(0), 'crc8')).toHaveLength(1);
    expect(appendChecksum(new Uint8Array(0), 'crc16-modbus')).toHaveLength(2);
  });
});

describe('checksumHex', () => {
  it('crc16-modbus 输出两字节大写 HEX（低字节在前）', () => {
    const src: Uint8Array = hexToBytes('01 03');
    const crc: number = crc16Modbus(src);
    const expected: string = bytesToHex(Uint8Array.from([crc & 0xff, (crc >>> 8) & 0xff]));
    expect(checksumHex(src, 'crc16-modbus')).toBe(expected);
    expect(checksumHex(src, 'crc16-modbus')).toMatch(/^[0-9A-F]{2} [0-9A-F]{2}$/);
  });

  it.each(['crc8', 'sum8', 'xor8'] as const)('%s 输出单字节大写 HEX', (algo) => {
    expect(checksumHex(hexToBytes('01 03'), algo)).toMatch(/^[0-9A-F]{2}$/);
  });

  it('输出复用 hex 唯一入口，恒为大写', () => {
    const out: string = checksumHex(CHECK_VECTOR, 'crc16-modbus');
    expect(out).toBe(out.toUpperCase());
  });
});
