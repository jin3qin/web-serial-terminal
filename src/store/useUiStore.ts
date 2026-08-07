/**
 * UI Store（Zustand）：主题模式、面板折叠、Snackbar 提示队列。
 * 依赖方向：store → { types }。
 */

import { create } from 'zustand';
import type { AutoSendConfig, ThemeMode } from '@/types/serial';
import { DEFAULT_AUTO_SEND } from '@/types/serial';

/** 提示级别，与 MUI Alert severity 对齐 */
export type NoticeSeverity = 'success' | 'info' | 'warning' | 'error';

export interface Notice {
  id: string;
  message: string;
  severity: NoticeSeverity;
  /** 自动关闭时长（毫秒） */
  duration: number;
}

/** 生成提示 id */
function newNoticeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UiStoreState {
  themeMode: ThemeMode;
  /** 高级区（RTS/DTR 信号线）是否展开 */
  advancedOpen: boolean;
  /** 发送历史面板是否展开 */
  historyOpen: boolean;
  /** 自动发送面板是否展开 */
  autoSendOpen: boolean;
  /** 数据曲线面板是否展开（P2 预留） */
  chartOpen: boolean;
  /** 宏面板是否展开（P2 预留） */
  macroOpen: boolean;
  /** 提示队列 */
  notices: Notice[];
  /** 自动发送运行时配置 */
  autoSend: AutoSendConfig;

  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setAdvancedOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  setAutoSendOpen: (open: boolean) => void;
  setChartOpen: (open: boolean) => void;
  setMacroOpen: (open: boolean) => void;
  /** 推入一条提示 */
  notify: (message: string, severity?: NoticeSeverity, duration?: number) => void;
  /** 关闭一条提示 */
  dismiss: (id: string) => void;
  /** 更新自动发送配置 */
  setAutoSend: (patch: Partial<AutoSendConfig>) => void;
  /** 重置自动发送计数 */
  resetAutoSendCount: () => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  themeMode: 'dark',
  advancedOpen: false,
  historyOpen: true,
  autoSendOpen: true,
  chartOpen: false,
  macroOpen: false,
  notices: [],
  autoSend: { ...DEFAULT_AUTO_SEND },

  setThemeMode: (mode: ThemeMode): void => {
    set({ themeMode: mode });
  },

  toggleTheme: (): void => {
    set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' }));
  },

  setAdvancedOpen: (open: boolean): void => {
    set({ advancedOpen: open });
  },

  setHistoryOpen: (open: boolean): void => {
    set({ historyOpen: open });
  },

  setAutoSendOpen: (open: boolean): void => {
    set({ autoSendOpen: open });
  },

  setChartOpen: (open: boolean): void => {
    set({ chartOpen: open });
  },

  setMacroOpen: (open: boolean): void => {
    set({ macroOpen: open });
  },

  notify: (message: string, severity: NoticeSeverity = 'info', duration: number = 4000): void => {
    const notice: Notice = { id: newNoticeId(), message, severity, duration };
    set((state) => ({ notices: [...state.notices, notice].slice(-5) }));
  },

  dismiss: (id: string): void => {
    set((state) => ({ notices: state.notices.filter((n) => n.id !== id) }));
  },

  setAutoSend: (patch: Partial<AutoSendConfig>): void => {
    set((state) => ({ autoSend: { ...state.autoSend, ...patch } }));
  },

  resetAutoSendCount: (): void => {
    set((state) => ({ autoSend: { ...state.autoSend, sentCount: 0 } }));
  },
}));
