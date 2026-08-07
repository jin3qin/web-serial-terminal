/**
 * Vitest 全局 setup。
 *
 * 只做「环境补齐」，不做任何业务 mock —— 业务 mock 一律在各测试文件内显式声明，
 * 避免隐式全局状态导致测试之间互相污染。
 */

import { afterEach, beforeEach, vi } from 'vitest';

/* --------------------------------------------------------------------------
 * 1. crypto.randomUUID —— MessageStore / UiStore 依赖它生成 id
 * -------------------------------------------------------------------------- */
if (typeof globalThis.crypto === 'undefined') {
  // 极端环境兜底
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  let seq = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: (): string => {
      seq += 1;
      return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
    },
  });
}

/* --------------------------------------------------------------------------
 * 2. URL.createObjectURL —— exporter 下载路径依赖，jsdom 未实现
 * -------------------------------------------------------------------------- */
if (typeof URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (): string => 'blob:mock/0000',
  });
}
if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (): void => undefined,
  });
}

/* --------------------------------------------------------------------------
 * 3. 每个用例结束后清理 localStorage / 定时器 / mock，保证用例独立幂等
 * -------------------------------------------------------------------------- */
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* 存储不可用测试场景下忽略 */
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    /* 忽略 */
  }
});

/* --------------------------------------------------------------------------
 * 4. 探测宿主是否支持 GBK 解码（Node full-icu），供 codec 测试条件跳过
 * -------------------------------------------------------------------------- */
export const HAS_NATIVE_GBK_DECODER: boolean = ((): boolean => {
  try {
    const d = new TextDecoder('gbk');
    return d.encoding === 'gbk';
  } catch {
    return false;
  }
})();
