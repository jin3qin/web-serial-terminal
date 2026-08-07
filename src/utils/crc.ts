/**
 * 校验算法工具（P2-5）。纯函数，无外部依赖。
 * 常用于 Modbus RTU 等协议在发送前自动追加校验字节。
 */

import { bytesToHex } from '@/utils/hex';

/** 支持的校验算法 */
export type ChecksumAlgorithm = 'crc16-modbus' | 'crc8' | 'sum8' | 'xor8';

/** CRC16-Modbus 查表（多项式 0xA001，即 0x8005 反转） */
const CRC16_TABLE: Uint16Array = ((): Uint16Array => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc: number = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    table[i] = crc & 0xffff;
  }
  return table;
})();

/** CRC8 查表（多项式 0x07，初始值 0x00） */
const CRC8_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc: number = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    table[i] = crc;
  }
  return table;
})();

/**
 * CRC16-Modbus 计算。
 *
 * @param bytes 输入字节
 * @returns 0x0000-0xFFFF
 */
export function crc16Modbus(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return crc & 0xffff;
}

/**
 * CRC8 计算（多项式 0x07）。
 *
 * @param bytes 输入字节
 * @returns 0x00-0xFF
 */
export function crc8(bytes: Uint8Array): number {
  let crc = 0x00;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC8_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return crc & 0xff;
}

/**
 * 8 位累加和。
 *
 * @param bytes 输入字节
 * @returns 0x00-0xFF
 */
export function sum8(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    sum = (sum + bytes[i]) & 0xff;
  }
  return sum;
}

/**
 * 8 位异或校验。
 *
 * @param bytes 输入字节
 * @returns 0x00-0xFF
 */
export function xor8(bytes: Uint8Array): number {
  let acc = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    acc = (acc ^ bytes[i]) & 0xff;
  }
  return acc;
}

/**
 * 计算校验并返回追加了校验字节的新字节序列。
 * CRC16-Modbus 按 Modbus 规范采用**低字节在前**。
 *
 * @param bytes 原始字节
 * @param algorithm 算法
 * @returns 追加校验后的新数组
 */
export function appendChecksum(bytes: Uint8Array, algorithm: ChecksumAlgorithm): Uint8Array {
  if (algorithm === 'crc16-modbus') {
    const crc: number = crc16Modbus(bytes);
    const out = new Uint8Array(bytes.length + 2);
    out.set(bytes, 0);
    out[bytes.length] = crc & 0xff;
    out[bytes.length + 1] = (crc >>> 8) & 0xff;
    return out;
  }

  const value: number =
    algorithm === 'crc8' ? crc8(bytes) : algorithm === 'sum8' ? sum8(bytes) : xor8(bytes);
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes, 0);
  out[bytes.length] = value;
  return out;
}

/**
 * 计算校验值并以 HEX 字符串形式返回（用于 UI 展示）。
 *
 * @param bytes 输入字节
 * @param algorithm 算法
 * @returns 大写 HEX，如 `C4 0B`
 */
export function checksumHex(bytes: Uint8Array, algorithm: ChecksumAlgorithm): string {
  if (algorithm === 'crc16-modbus') {
    const crc: number = crc16Modbus(bytes);
    return bytesToHex(Uint8Array.from([crc & 0xff, (crc >>> 8) & 0xff]));
  }
  const value: number =
    algorithm === 'crc8' ? crc8(bytes) : algorithm === 'sum8' ? sum8(bytes) : xor8(bytes);
  return bytesToHex(Uint8Array.from([value]));
}
