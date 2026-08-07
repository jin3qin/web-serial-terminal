/**
 * 连接状态 Store（Zustand）。
 * 依赖方向：store → { types }，禁止 import serial / components。
 */

import { create } from 'zustand';
import {
  DEFAULT_SERIAL_CONFIG,
  DEFAULT_STATS,
  type ConnectionState,
  type PortEntry,
  type SerialConfig,
  type SerialError,
  type SerialStats,
} from '@/types/serial';

/** 输出信号线状态（可写） */
export interface OutputSignals {
  dataTerminalReady: boolean;
  requestToSend: boolean;
}

/** 输入信号线状态（只读展示） */
export interface InputSignalsState {
  clearToSend: boolean;
  dataSetReady: boolean;
  dataCarrierDetect: boolean;
  ringIndicator: boolean;
}

export const DEFAULT_OUTPUT_SIGNALS: OutputSignals = {
  dataTerminalReady: false,
  requestToSend: false,
};

export const DEFAULT_INPUT_SIGNALS: InputSignalsState = {
  clearToSend: false,
  dataSetReady: false,
  dataCarrierDetect: false,
  ringIndicator: false,
};

export interface SerialStoreState {
  /** 连接状态机 */
  connectionState: ConnectionState;
  /** 串口参数 */
  config: SerialConfig;
  /** 已授权端口列表 */
  ports: PortEntry[];
  /** 当前选中的端口 id */
  selectedPortId: string | null;
  /** 当前连接的端口友好名 */
  portLabel: string;
  /** 收发统计 */
  stats: SerialStats;
  /** 最近一次错误 */
  lastError: SerialError | null;
  /** 输出信号线 */
  outputSignals: OutputSignals;
  /** 输入信号线 */
  inputSignals: InputSignalsState;

  /** 设置连接状态（对应类图 setState，为避免与 zustand 静态 API 混淆而更名） */
  setConnectionState: (s: ConnectionState) => void;
  /** 局部更新串口参数 */
  setConfig: (patch: Partial<SerialConfig>) => void;
  /** 覆盖端口列表 */
  setPorts: (ports: PortEntry[]) => void;
  /** 选中端口 */
  selectPort: (id: string | null) => void;
  /** 设置当前连接端口名 */
  setPortLabel: (label: string) => void;
  /** 累加接收字节 */
  addRx: (n: number) => void;
  /** 累加发送字节 */
  addTx: (n: number) => void;
  /** 重置统计并记录连接起始时间 */
  resetStats: (connectedAt?: number | null) => void;
  /** 设置错误 */
  setError: (err: SerialError | null) => void;
  /** 清除错误 */
  clearError: () => void;
  /** 设置输出信号线 */
  setOutputSignals: (patch: Partial<OutputSignals>) => void;
  /** 设置输入信号线 */
  setInputSignals: (patch: Partial<InputSignalsState>) => void;
}

export const useSerialStore = create<SerialStoreState>((set) => ({
  connectionState: 'idle',
  config: { ...DEFAULT_SERIAL_CONFIG },
  ports: [],
  selectedPortId: null,
  portLabel: '',
  stats: { ...DEFAULT_STATS },
  lastError: null,
  outputSignals: { ...DEFAULT_OUTPUT_SIGNALS },
  inputSignals: { ...DEFAULT_INPUT_SIGNALS },

  setConnectionState: (s: ConnectionState): void => {
    set({ connectionState: s });
  },

  setConfig: (patch: Partial<SerialConfig>): void => {
    set((state) => ({ config: { ...state.config, ...patch } }));
  },

  setPorts: (ports: PortEntry[]): void => {
    set((state) => {
      const stillExists: boolean =
        state.selectedPortId !== null && ports.some((p) => p.id === state.selectedPortId);
      const nextSelected: string | null = stillExists
        ? state.selectedPortId
        : ports.length > 0
          ? ports[0].id
          : null;
      return { ports, selectedPortId: nextSelected };
    });
  },

  selectPort: (id: string | null): void => {
    set({ selectedPortId: id });
  },

  setPortLabel: (label: string): void => {
    set({ portLabel: label });
  },

  addRx: (n: number): void => {
    if (n <= 0) {
      return;
    }
    set((state) => ({
      stats: { ...state.stats, rxBytes: state.stats.rxBytes + n, rxFrames: state.stats.rxFrames + 1 },
    }));
  },

  addTx: (n: number): void => {
    if (n <= 0) {
      return;
    }
    set((state) => ({
      stats: { ...state.stats, txBytes: state.stats.txBytes + n, txFrames: state.stats.txFrames + 1 },
    }));
  },

  resetStats: (connectedAt: number | null = null): void => {
    set({ stats: { ...DEFAULT_STATS, connectedAt } });
  },

  setError: (err: SerialError | null): void => {
    set({ lastError: err });
  },

  clearError: (): void => {
    set({ lastError: null });
  },

  setOutputSignals: (patch: Partial<OutputSignals>): void => {
    set((state) => ({ outputSignals: { ...state.outputSignals, ...patch } }));
  },

  setInputSignals: (patch: Partial<InputSignalsState>): void => {
    set((state) => ({ inputSignals: { ...state.inputSignals, ...patch } }));
  },
}));

/** 派生：是否处于「已连接」状态 */
export function selectIsConnected(state: SerialStoreState): boolean {
  return state.connectionState === 'connected';
}

/** 派生：是否处于「忙碌」状态（连接中 / 断开中 / 选择端口中） */
export function selectIsBusy(state: SerialStoreState): boolean {
  return (
    state.connectionState === 'connecting' ||
    state.connectionState === 'disconnecting' ||
    state.connectionState === 'requesting'
  );
}
