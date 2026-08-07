/**
 * localStorage 持久化（系统设计 §8.5）。
 *
 * - key：`spdt:profile`（PersistedProfile）、`spdt:history`（发送历史）
 * - 所有读取 try/catch + 结构校验，损坏时回退默认值并清除脏数据
 * - 隐私模式 / 存储被禁用时降级为内存 Map，保证功能不崩
 */

import {
  DEFAULT_AUTO_SEND,
  DEFAULT_DISPLAY_OPTIONS,
  DEFAULT_PROFILE,
  DEFAULT_SERIAL_CONFIG,
  DEFAULT_SEND_OPTIONS,
  PERF,
  PROFILE_VERSION,
  STORAGE_KEYS,
  type DisplayOptions,
  type PersistedProfile,
  type SendOptions,
  type SerialConfig,
  type ThemeMode,
} from '@/types/serial';

/** 存储不可用时的内存兜底 */
const memoryStore = new Map<string, string>();
let storageAvailable: boolean | null = null;

/**
 * 探测 localStorage 是否可用（隐私模式下 setItem 会抛异常）。
 */
function isStorageAvailable(): boolean {
  if (storageAvailable !== null) {
    return storageAvailable;
  }
  try {
    const probe = '__spdt_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

/**
 * 读原始字符串。
 *
 * @param key 存储键
 */
function readRaw(key: string): string | null {
  if (isStorageAvailable()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  }
  return memoryStore.get(key) ?? null;
}

/**
 * 写原始字符串。
 *
 * @param key 存储键
 * @param value 内容
 * @returns 是否写入到了真正的 localStorage
 */
function writeRaw(key: string, value: string): boolean {
  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      memoryStore.set(key, value);
      return false;
    }
  }
  memoryStore.set(key, value);
  return false;
}

/**
 * 删除某个键。
 *
 * @param key 存储键
 */
function removeRaw(key: string): void {
  memoryStore.delete(key);
  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* 忽略：已在内存中删除 */
    }
  }
}

/** 判断是否为普通对象 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 校验并补全串口配置。
 *
 * @param raw 未知输入
 */
function sanitizeConfig(raw: unknown): SerialConfig {
  const base: SerialConfig = { ...DEFAULT_SERIAL_CONFIG };
  if (!isRecord(raw)) {
    return base;
  }
  const baudRate = Number(raw.baudRate);
  if (Number.isFinite(baudRate) && baudRate > 0) {
    base.baudRate = Math.floor(baudRate);
  }
  if (raw.dataBits === 7 || raw.dataBits === 8) {
    base.dataBits = raw.dataBits;
  }
  if (raw.stopBits === 1 || raw.stopBits === 2) {
    base.stopBits = raw.stopBits;
  }
  if (raw.parity === 'none' || raw.parity === 'even' || raw.parity === 'odd') {
    base.parity = raw.parity;
  }
  if (raw.flowControl === 'none' || raw.flowControl === 'hardware') {
    base.flowControl = raw.flowControl;
  }
  const bufferSize = Number(raw.bufferSize);
  if (Number.isFinite(bufferSize) && bufferSize >= 256) {
    base.bufferSize = Math.floor(bufferSize);
  }
  return base;
}

/**
 * 校验并补全发送选项。
 *
 * @param raw 未知输入
 */
function sanitizeSendOptions(raw: unknown): SendOptions {
  const base: SendOptions = { ...DEFAULT_SEND_OPTIONS };
  if (!isRecord(raw)) {
    return base;
  }
  if (raw.mode === 'text' || raw.mode === 'hex') {
    base.mode = raw.mode;
  }
  if (raw.encoding === 'utf-8' || raw.encoding === 'gbk') {
    base.encoding = raw.encoding;
  }
  if (raw.lineEnding === 'none' || raw.lineEnding === 'lf' || raw.lineEnding === 'cr' || raw.lineEnding === 'crlf') {
    base.lineEnding = raw.lineEnding;
  }
  return base;
}

/**
 * 校验并补全显示选项。
 *
 * @param raw 未知输入
 */
function sanitizeDisplayOptions(raw: unknown): DisplayOptions {
  const base: DisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS };
  if (!isRecord(raw)) {
    return base;
  }
  if (raw.displayMode === 'ascii' || raw.displayMode === 'hex') {
    base.displayMode = raw.displayMode;
  }
  if (raw.encoding === 'utf-8' || raw.encoding === 'gbk') {
    base.encoding = raw.encoding;
  }
  if (typeof raw.showTimestamp === 'boolean') {
    base.showTimestamp = raw.showTimestamp;
  }
  if (typeof raw.autoScroll === 'boolean') {
    base.autoScroll = raw.autoScroll;
  }
  const perLine = Number(raw.hexBytesPerLine);
  if (Number.isFinite(perLine) && perLine >= 4 && perLine <= 64) {
    base.hexBytesPerLine = Math.floor(perLine);
  }
  return base;
}

/**
 * 校验并补全自动发送配置（持久化部分）。
 *
 * @param raw 未知输入
 */
function sanitizeAutoSend(raw: unknown): PersistedProfile['autoSend'] {
  const base: PersistedProfile['autoSend'] = {
    intervalMs: DEFAULT_AUTO_SEND.intervalMs,
    repeatMode: DEFAULT_AUTO_SEND.repeatMode,
    maxCount: DEFAULT_AUTO_SEND.maxCount,
  };
  if (!isRecord(raw)) {
    return base;
  }
  const interval = Number(raw.intervalMs);
  if (Number.isFinite(interval) && interval >= PERF.MIN_AUTO_SEND_INTERVAL_MS) {
    base.intervalMs = Math.floor(interval);
  }
  if (raw.repeatMode === 'infinite' || raw.repeatMode === 'count') {
    base.repeatMode = raw.repeatMode;
  }
  const maxCount = Number(raw.maxCount);
  if (Number.isFinite(maxCount) && maxCount >= 1) {
    base.maxCount = Math.floor(maxCount);
  }
  return base;
}

/**
 * 校验历史数组。
 *
 * @param raw 未知输入
 */
function sanitizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const list: string[] = raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return list.slice(0, PERF.MAX_HISTORY);
}

/**
 * 版本迁移。当前只有 version 1，未来新增版本在此逐级升级。
 *
 * @param raw 反序列化后的原始对象
 * @returns 归一化后的 PersistedProfile
 */
function migrate(raw: unknown): PersistedProfile {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const themeMode: ThemeMode = record.themeMode === 'light' ? 'light' : 'dark';

  return {
    version: PROFILE_VERSION,
    config: sanitizeConfig(record.config),
    sendOptions: sanitizeSendOptions(record.sendOptions),
    displayOptions: sanitizeDisplayOptions(record.displayOptions),
    autoSend: sanitizeAutoSend(record.autoSend),
    history: sanitizeHistory(record.history),
    themeMode,
  };
}

/**
 * 读取持久化档案。任何异常都回退默认值并清除脏数据。
 *
 * @returns PersistedProfile（永不为 null）
 */
export function loadProfile(): PersistedProfile {
  const raw: string | null = readRaw(STORAGE_KEYS.PROFILE);
  if (!raw) {
    return { ...DEFAULT_PROFILE, history: loadHistory() };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const profile: PersistedProfile = migrate(parsed);
    // 历史单独存储，优先以独立 key 为准
    const standalone: string[] = loadHistory();
    if (standalone.length > 0) {
      profile.history = standalone;
    }
    return profile;
  } catch {
    removeRaw(STORAGE_KEYS.PROFILE);
    return { ...DEFAULT_PROFILE, history: [] };
  }
}

/**
 * 保存持久化档案（历史单独写入 spdt:history）。
 *
 * @param profile 档案
 * @returns 是否成功写入 localStorage（false 表示已降级为内存）
 */
export function saveProfile(profile: PersistedProfile): boolean {
  try {
    const payload: PersistedProfile = { ...profile, version: PROFILE_VERSION };
    const ok: boolean = writeRaw(STORAGE_KEYS.PROFILE, JSON.stringify(payload));
    saveHistory(profile.history);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 读取发送历史。
 *
 * @returns 最多 50 条，最新在前
 */
export function loadHistory(): string[] {
  const raw: string | null = readRaw(STORAGE_KEYS.HISTORY);
  if (!raw) {
    return [];
  }
  try {
    return sanitizeHistory(JSON.parse(raw));
  } catch {
    removeRaw(STORAGE_KEYS.HISTORY);
    return [];
  }
}

/**
 * 保存发送历史（自动去重 + 截断到上限）。
 *
 * @param history 历史数组，最新在前
 */
export function saveHistory(history: string[]): void {
  const unique: string[] = [];
  for (const item of history) {
    if (typeof item === 'string' && item.length > 0 && !unique.includes(item)) {
      unique.push(item);
    }
    if (unique.length >= PERF.MAX_HISTORY) {
      break;
    }
  }
  try {
    writeRaw(STORAGE_KEYS.HISTORY, JSON.stringify(unique));
  } catch {
    /* 忽略：写入失败不影响主流程 */
  }
}

/** 清空全部本地数据 */
export function clearAll(): void {
  removeRaw(STORAGE_KEYS.PROFILE);
  removeRaw(STORAGE_KEYS.HISTORY);
}

/** 存储是否可用（供 UI 提示「配置不会被保存」） */
export function isPersistenceAvailable(): boolean {
  return isStorageAvailable();
}
