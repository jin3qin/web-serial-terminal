/**
 * Environment detection and port utilities (WebSocket version).
 * 
 * Zero React dependency.
 * Direction: serial → { utils, types }, no imports from store/react.
 */

import { byteToHex } from '@/utils/hex';
import type { SupportResult } from '@/types/serial';

/**
 * Check if WebSocket is available (always true in modern browsers).
 */
export function isApiAvailable(): boolean {
  return typeof WebSocket !== 'undefined';
}

/**
 * Check if running in secure context (HTTPS or localhost).
 */
export function isSecureContextOk(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.isSecureContext) {
    return true;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * Detect browser name for display purposes.
 */
export function detectBrowser(): string {
  if (typeof navigator === 'undefined') {
    return '未知环境';
  }
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) {
    return 'Microsoft Edge';
  }
  if (/OPR\//.test(ua)) {
    return 'Opera';
  }
  if (/Firefox\//.test(ua)) {
    return 'Mozilla Firefox';
  }
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    return 'Google Chrome';
  }
  if (/Chromium\//.test(ua)) {
    return 'Chromium';
  }
  if (/Safari\//.test(ua)) {
    return 'Apple Safari';
  }
  return '未知浏览器';
}

/**
 * Full environment detection.
 * Now checks WebSocket availability instead of Web Serial API.
 */
export function detect(): SupportResult {
  const hasApi = isApiAvailable();
  const isSecure = isSecureContextOk();
  const browser = detectBrowser();

  if (!isSecure) {
    return {
      supported: false,
      reason: 'E_INSECURE_CONTEXT',
      detail: '浏览器仅在安全上下文中工作。请通过 https:// 或 http://localhost 访问本页面。',
      browser,
      isSecure,
      hasApi,
    };
  }

  if (!hasApi) {
    return {
      supported: false,
      reason: 'E_UNSUPPORTED',
      detail: `当前浏览器（${browser}）不支持 WebSocket。`,
      browser,
      isSecure,
      hasApi,
    };
  }

  return {
    supported: true,
    detail: '环境检测通过，可以连接到调试服务器。',
    browser,
    isSecure,
    hasApi,
  };
}

/**
 * Generate a friendly port label.
 * Kept for backward compatibility - actual labels come from backend.
 */
export function getPortLabel(port: unknown, index: number = 0): string {
  return `串口设备 #${index + 1}`;
}

/**
 * Generate a stable port ID.
 * Kept for backward compatibility - actual IDs come from backend.
 */
export function getPortId(port: unknown, index: number = 0): string {
  return `port-${index}`;
}

/**
 * Convert port list to PortEntry format.
 * In WebSocket mode, ports already come in the right format.
 */
export function toPortEntries(ports: readonly any[]): import('@/types/serial').PortEntry[] {
  return ports.map((port, index) => {
    // If port already has the right structure, use it
    if (port.id && port.label) {
      return port;
    }
    // Otherwise create from name property
    const name = port.name || `port-${index}`;
    const description = port.description || '';
    return {
      id: name,
      // Show actual port name, with description as secondary info if available
      label: description ? `${name} (${description})` : name,
      port: port,
    };
  });
}