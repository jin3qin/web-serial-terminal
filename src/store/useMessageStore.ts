/**
 * 消息 Store（Zustand）：环形缓冲 + 显示/发送选项 + 发送历史。
 * 依赖方向：store → { types }，禁止 import serial / components。
 */

import { create } from 'zustand';
import {
  DEFAULT_DISPLAY_OPTIONS,
  DEFAULT_SEND_OPTIONS,
  PERF,
  type DisplayOptions,
  type MessageRecord,
  type SendOptions,
  type SystemLevel,
  type TextEncodingName,
} from '@/types/serial';

/**
 * 生成消息 id。优先使用原生 crypto.randomUUID（§8.1 约定），
 * 在极老环境下降级为时间戳 + 随机数。
 */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 创建一条收/发消息 */
export function createDataRecord(
  direction: 'tx' | 'rx',
  raw: Uint8Array,
  encoding: TextEncodingName,
): MessageRecord {
  return {
    id: newId(),
    direction,
    timestamp: Date.now(),
    raw,
    byteLength: raw.byteLength,
    encoding,
  };
}

/** 创建一条系统消息 */
export function createSystemRecord(note: string, level: SystemLevel = 'info'): MessageRecord {
  return {
    id: newId(),
    direction: 'system',
    timestamp: Date.now(),
    raw: new Uint8Array(0),
    byteLength: 0,
    encoding: 'utf-8',
    note,
    level,
  };
}

export interface MessageStoreState {
  /** 消息环形缓冲 */
  messages: MessageRecord[];
  /** 上限，超出丢弃最旧 */
  maxRecords: number;
  displayOptions: DisplayOptions;
  sendOptions: SendOptions;
  /** 发送历史，最新在前，最多 50 条 */
  history: string[];
  /** 发送输入框草稿（提升到 store，便于自动发送/历史回填共享） */
  draft: string;

  /** 设置发送草稿 */
  setDraft: (text: string) => void;
  /** 追加一条消息 */
  append: (m: MessageRecord) => void;
  /** 批量追加（节流刷新用） */
  appendMany: (list: readonly MessageRecord[]) => void;
  /** 追加一条系统消息 */
  appendSystem: (note: string, level?: SystemLevel) => void;
  /** 清空消息 */
  clear: () => void;
  /** 局部更新显示选项 */
  setDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  /** 局部更新发送选项 */
  setSendOptions: (patch: Partial<SendOptions>) => void;
  /** 压入一条发送历史（去重，最新在前） */
  pushHistory: (text: string) => void;
  /** 覆盖历史（从 localStorage 回填） */
  setHistory: (list: string[]) => void;
  /** 删除一条历史 */
  removeHistory: (text: string) => void;
  /** 清空历史 */
  clearHistory: () => void;
}

/**
 * 环形缓冲裁剪：超出上限时丢弃最旧，保留最新。
 *
 * @param list 当前列表
 * @param max 上限
 */
function trim(list: MessageRecord[], max: number): MessageRecord[] {
  if (list.length <= max) {
    return list;
  }
  return list.slice(list.length - max);
}

export const useMessageStore = create<MessageStoreState>((set) => ({
  messages: [],
  maxRecords: PERF.MAX_MESSAGES,
  displayOptions: { ...DEFAULT_DISPLAY_OPTIONS },
  sendOptions: { ...DEFAULT_SEND_OPTIONS },
  history: [],
  draft: '',

  setDraft: (text: string): void => {
    set({ draft: text });
  },

  append: (m: MessageRecord): void => {
    set((state) => ({ messages: trim([...state.messages, m], state.maxRecords) }));
  },

  appendMany: (list: readonly MessageRecord[]): void => {
    if (list.length === 0) {
      return;
    }
    set((state) => ({ messages: trim([...state.messages, ...list], state.maxRecords) }));
  },

  appendSystem: (note: string, level: SystemLevel = 'info'): void => {
    set((state) => ({
      messages: trim([...state.messages, createSystemRecord(note, level)], state.maxRecords),
    }));
  },

  clear: (): void => {
    set({ messages: [] });
  },

  setDisplayOptions: (patch: Partial<DisplayOptions>): void => {
    set((state) => ({ displayOptions: { ...state.displayOptions, ...patch } }));
  },

  setSendOptions: (patch: Partial<SendOptions>): void => {
    set((state) => ({ sendOptions: { ...state.sendOptions, ...patch } }));
  },

  pushHistory: (text: string): void => {
    const value: string = text;
    if (value.length === 0) {
      return;
    }
    set((state) => {
      const next: string[] = [value, ...state.history.filter((h) => h !== value)];
      return { history: next.slice(0, PERF.MAX_HISTORY) };
    });
  },

  setHistory: (list: string[]): void => {
    set({ history: list.slice(0, PERF.MAX_HISTORY) });
  },

  removeHistory: (text: string): void => {
    set((state) => ({ history: state.history.filter((h) => h !== text) }));
  },

  clearHistory: (): void => {
    set({ history: [] });
  },
}));
