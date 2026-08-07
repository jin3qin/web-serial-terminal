/**
 * Type declarations for gbk.js library.
 * Provides GBK encoding/decoding utilities for Chinese character support.
 */

declare module 'gbk.js' {
  /**
   * Encode a string to GBK-encoded Uint8Array.
   * @param str - The input string to encode
   * @returns GBK-encoded byte array
   */
  export function encode(str: string): Uint8Array;

  /**
   * Decode a GBK-encoded Uint8Array to string.
   * @param bytes - The GBK-encoded byte array
   * @returns Decoded string
   */
  export function decode(bytes: Uint8Array): string;
}