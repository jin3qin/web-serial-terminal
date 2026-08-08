/**
 * Global type definitions.
 * 
 * This file must not import any other layer.
 * All cross-layer shared types, constants, and error definitions are defined here.
 */

/* ==========================================================================
 * Control signals
 * ========================================================================== */

export interface SerialInputSignals {
  clearToSend: boolean;      // CTS
  dataSetReady: boolean;     // DSR
  dataCarrierDetect: boolean; // DCD
  ringIndicator: boolean;    // RI
}

/* ==========================================================================
 * Serial parameters
 * ========================================================================== */

export type ParityType = 'none' | 'even' | 'odd';
export type FlowControlType = 'none' | 'hardware';

export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: ParityType;
  flowControl: FlowControlType;
  bufferSize: number;
}

/* ==========================================================================
 * Connection state machine
 * ========================================================================== */

export type ConnectionState =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

/* ==========================================================================
 * Send/receive modes
 * ========================================================================== */

export type SendMode = 'text' | 'hex';
export type DisplayMode = 'ascii' | 'hex';
export type TextEncodingName = 'utf-8' | 'gbk';
export type LineEnding = 'none' | 'lf' | 'cr' | 'crlf';
export type Direction = 'tx' | 'rx' | 'system';

export interface SendOptions {
  mode: SendMode;
  encoding: TextEncodingName;
  lineEnding: LineEnding;
}

export interface DisplayOptions {
  displayMode: DisplayMode;
  encoding: TextEncodingName;
  showTimestamp: boolean;
  autoScroll: boolean;
  hexBytesPerLine: number;
}

/* ==========================================================================
 * Message records
 * ========================================================================== */

export interface MessageRecord {
  id: string;
  sessionId?: string;
  direction: Direction;
  timestamp: number;
  raw: Uint8Array;
  byteLength: number;
  encoding: TextEncodingName;
  note?: string;
  level?: SystemLevel;
}

export type SystemLevel = 'info' | 'warning' | 'error';

/** Port entry (WebSocket version - port field is optional) */
export interface PortEntry {
  id: string;
  label: string;
  port?: unknown;
  name?: string;
  description?: string;
}

/* ==========================================================================
 * Auto send
 * ========================================================================== */

export type RepeatMode = 'infinite' | 'count';

export interface AutoSendConfig {
  enabled: boolean;
  intervalMs: number;
  repeatMode: RepeatMode;
  maxCount: number;
  sentCount: number;
}

/* ==========================================================================
 * Macro shortcuts
 * ========================================================================== */

/** 快捷指令组 */
export interface MacroGroup {
  id: string;
  name: string;
  description?: string;
  /** 排序权重 */
  order: number;
}

export interface MacroShortcut {
  id: string;
  label: string;
  payload: string;
  mode: SendMode;
  description: string;
  /** 所属组ID（undefined表示未分组） */
  groupId?: string;
}

/** 快捷指令存储结构 */
export interface MacroStorage {
  version: number;
  groups: MacroGroup[];
  macros: MacroShortcut[];
}

export const MAX_GROUPS = 10;
export const MAX_MACROS = 50;

export const DEFAULT_GROUPS: readonly MacroGroup[] = [
  { id: 'at-commands', name: 'AT 指令', order: 0 },
  { id: 'modbus', name: 'Modbus', order: 1 },
];

export const DEFAULT_MACROS: readonly MacroShortcut[] = [
  { id: 'at', label: 'AT', payload: 'AT', mode: 'text', description: '模块握手指令', groupId: 'at-commands' },
  { id: 'at-gmr', label: 'AT+GMR', payload: 'AT+GMR', mode: 'text', description: '查询固件版本', groupId: 'at-commands' },
  { id: 'at-rst', label: 'AT+RST', payload: 'AT+RST', mode: 'text', description: '软复位', groupId: 'at-commands' },
  {
    id: 'modbus-read-hr',
    label: 'Modbus 读保持寄存器',
    payload: '01 03 00 00 00 01',
    mode: 'hex',
    description: '从站 1，读地址 0 起 1 个寄存器（不含 CRC）',
    groupId: 'modbus',
  },
  {
    id: 'modbus-read-coil',
    label: 'Modbus 读线圈',
    payload: '01 01 00 00 00 08',
    mode: 'hex',
    description: '从站 1，读地址 0 起 8 个线圈（不含 CRC）',
    groupId: 'modbus',
  },
];

/* ==========================================================================
 * Statistics and persistence
 * ========================================================================== */

export interface SerialStats {
  rxBytes: number;
  txBytes: number;
  rxFrames: number;
  txFrames: number;
  connectedAt: number | null;
}

export type ThemeMode = 'light' | 'dark';

export interface PersistedProfile {
  version: number;
  config: SerialConfig;
  sendOptions: SendOptions;
  displayOptions: DisplayOptions;
  autoSend: Omit<AutoSendConfig, 'enabled' | 'sentCount'>;
  history: string[];
  themeMode: ThemeMode;
  macros: MacroShortcut[];
}

/* ==========================================================================
 * Error codes and unified error type
 * ========================================================================== */

export type SerialErrorCode =
  | 'E_UNSUPPORTED'
  | 'E_INSECURE_CONTEXT'
  | 'E_NO_PORT_SELECTED'
  | 'E_OPEN_FAILED'
  | 'E_ALREADY_OPEN'
  | 'E_NOT_CONNECTED'
  | 'E_WRITE_FAILED'
  | 'E_READ_ABORTED'
  | 'E_DEVICE_LOST'
  | 'E_INVALID_HEX'
  | 'E_ENCODE_FAILED'
  | 'E_STORAGE_UNAVAILABLE'
  | 'E_WS_DISCONNECTED'
  | 'E_UNKNOWN';

/** Error code to user-visible message */
export const ERROR_MESSAGES: Record<SerialErrorCode, string> = {
  E_UNSUPPORTED: '当前环境不支持，请使用现代浏览器',
  E_INSECURE_CONTEXT: '需通过 HTTPS 或 localhost 访问',
  E_NO_PORT_SELECTED: '请选择一个端口',
  E_OPEN_FAILED: '端口打开失败，可能被其他程序占用',
  E_ALREADY_OPEN: '端口已处于连接状态',
  E_NOT_CONNECTED: '尚未连接串口，无法发送',
  E_WRITE_FAILED: '发送失败',
  E_READ_ABORTED: '读取已停止',
  E_DEVICE_LOST: '设备已断开连接',
  E_INVALID_HEX: 'HEX 格式不正确',
  E_ENCODE_FAILED: 'GBK 编码组件加载失败，已降级为 UTF-8',
  E_STORAGE_UNAVAILABLE: '本地存储不可用，配置将不会被保存',
  E_WS_DISCONNECTED: '与调试服务器的连接已断开',
  E_UNKNOWN: '发生未知错误',
};

/** Benign error codes - no red popup */
export const BENIGN_ERROR_CODES: ReadonlySet<SerialErrorCode> = new Set<SerialErrorCode>([
  'E_NO_PORT_SELECTED',
  'E_READ_ABORTED',
]);

/** Unified error type */
export class SerialError extends Error {
  public readonly code: SerialErrorCode;
  public readonly cause?: unknown;

  constructor(code: SerialErrorCode, message?: string, cause?: unknown) {
    super(message ?? ERROR_MESSAGES[code] ?? ERROR_MESSAGES.E_UNKNOWN);
    this.name = 'SerialError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, SerialError.prototype);
  }

  public get benign(): boolean {
    return BENIGN_ERROR_CODES.has(this.code);
  }

  public static from(e: unknown, fallbackCode: SerialErrorCode = 'E_UNKNOWN'): SerialError {
    if (e instanceof SerialError) {
      return e;
    }
    if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
      switch (e.name) {
        case 'NotFoundError':
          return new SerialError('E_NO_PORT_SELECTED', ERROR_MESSAGES.E_NO_PORT_SELECTED, e);
        case 'NetworkError':
          return new SerialError('E_DEVICE_LOST', ERROR_MESSAGES.E_DEVICE_LOST, e);
        case 'InvalidStateError':
          return new SerialError('E_ALREADY_OPEN', ERROR_MESSAGES.E_ALREADY_OPEN, e);
        case 'AbortError':
          return new SerialError('E_READ_ABORTED', ERROR_MESSAGES.E_READ_ABORTED, e);
        case 'SecurityError':
          return new SerialError('E_INSECURE_CONTEXT', ERROR_MESSAGES.E_INSECURE_CONTEXT, e);
        default:
          return new SerialError(fallbackCode, `${ERROR_MESSAGES[fallbackCode]}（${e.message}）`, e);
      }
    }
    if (e instanceof Error) {
      return new SerialError(fallbackCode, `${ERROR_MESSAGES[fallbackCode]}（${e.message}）`, e);
    }
    return new SerialError(fallbackCode, ERROR_MESSAGES[fallbackCode], e);
  }
}

/* ==========================================================================
 * Environment detection result
 * ========================================================================== */

export interface SupportResult {
  supported: boolean;
  reason?: Extract<SerialErrorCode, 'E_UNSUPPORTED' | 'E_INSECURE_CONTEXT'>;
  detail: string;
  browser: string;
  isSecure: boolean;
  hasApi: boolean;
}

/* ==========================================================================
 * SerialService events
 * ========================================================================== */

export type CloseReason = 'manual' | 'lost' | 'error';

export interface SerialOpenInfo {
  label: string;
}

export interface SerialServiceEvents {
  open: (info: SerialOpenInfo) => void;
  data: (chunk: Uint8Array) => void;
  error: (err: SerialError) => void;
  close: (reason: CloseReason) => void;
}

export type SerialEventName = keyof SerialServiceEvents;
export type Unsubscribe = () => void;

/* ==========================================================================
 * Constants and defaults
 * ========================================================================== */

export const BAUD_RATE_OPTIONS: readonly number[] = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const;

export const DATA_BITS_OPTIONS: readonly (7 | 8)[] = [7, 8] as const;
export const STOP_BITS_OPTIONS: readonly (1 | 2)[] = [1, 2] as const;

export const PARITY_OPTIONS: ReadonlyArray<{ value: ParityType; label: string }> = [
  { value: 'none', label: '无校验 (None)' },
  { value: 'even', label: '偶校验 (Even)' },
  { value: 'odd', label: '奇校验 (Odd)' },
];

export const FLOW_CONTROL_OPTIONS: ReadonlyArray<{ value: FlowControlType; label: string }> = [
  { value: 'none', label: '无流控 (None)' },
  { value: 'hardware', label: '硬件流控 (RTS/CTS)' },
];

export const ENCODING_OPTIONS: ReadonlyArray<{ value: TextEncodingName; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' },
];

export const LINE_ENDING_OPTIONS: ReadonlyArray<{ value: LineEnding; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'lf', label: 'LF (\\n)' },
  { value: 'cr', label: 'CR (\\r)' },
  { value: 'crlf', label: 'CRLF (\\r\\n)' },
];

export const LINE_ENDING_TEXT: Record<LineEnding, string> = {
  none: '',
  lf: '\n',
  cr: '\r',
  crlf: '\r\n',
};

export const DEFAULT_SERIAL_CONFIG: SerialConfig = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
  bufferSize: 8192,
};

export const DEFAULT_SEND_OPTIONS: SendOptions = {
  mode: 'text',
  encoding: 'utf-8',
  lineEnding: 'none',
};

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  displayMode: 'ascii',
  encoding: 'utf-8',
  showTimestamp: true,
  autoScroll: true,
  hexBytesPerLine: 16,
};

export const DEFAULT_AUTO_SEND: AutoSendConfig = {
  enabled: false,
  intervalMs: 1000,
  repeatMode: 'infinite',
  maxCount: 10,
  sentCount: 0,
};

export const DEFAULT_STATS: SerialStats = {
  rxBytes: 0,
  txBytes: 0,
  rxFrames: 0,
  txFrames: 0,
  connectedAt: null,
};

/** Performance thresholds */
export const PERF = {
  FRAME_SILENCE_MS: 30,
  FRAME_MAX_BYTES: 4096,
  UI_THROTTLE_MS: 60,
  MAX_MESSAGES: 5000,
  ROW_HEIGHT: 22,
  MIN_AUTO_SEND_INTERVAL_MS: 20,
  MAX_HISTORY: 50,
} as const;

/** Storage keys */
export const STORAGE_KEYS = {
  PROFILE: 'spdt:profile',
  HISTORY: 'spdt:history',
  MACROS: 'spdt:macros',
  MACRO_STORAGE: 'spdt:macro-storage',
} as const;

/** Current profile version */
export const PROFILE_VERSION = 1;

/** Default persisted profile */
export const DEFAULT_PROFILE: PersistedProfile = {
  version: PROFILE_VERSION,
  config: { ...DEFAULT_SERIAL_CONFIG },
  sendOptions: { ...DEFAULT_SEND_OPTIONS },
  displayOptions: { ...DEFAULT_DISPLAY_OPTIONS },
  autoSend: {
    intervalMs: DEFAULT_AUTO_SEND.intervalMs,
    repeatMode: DEFAULT_AUTO_SEND.repeatMode,
    maxCount: DEFAULT_AUTO_SEND.maxCount,
  },
  history: [],
  themeMode: 'dark',
  macros: [...DEFAULT_MACROS],
};