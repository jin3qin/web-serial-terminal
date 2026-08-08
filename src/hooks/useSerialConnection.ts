/**
 * Serial connection orchestration layer.
 * 
 * Connects SerialService ↔ Store ↔ Utils.
 * Dependencies: hooks → { store, serial, utils, types }.
 * Components must not import SerialService directly - use this hook.
 * 
 * WebSocket-based implementation.
 */

import { useEffect, useMemo } from 'react';
import {
  LINE_ENDING_TEXT,
  PERF,
  SerialError,
  type CloseReason,
  type PersistedProfile,
  type PortEntry,
  type SerialOpenInfo,
} from '@/types/serial';
import { serialService, type PortEntry as WsPortEntry } from '@/serial/SerialService';
import { detect, toPortEntries } from '@/serial/serialSupport';
import { useSerialStore } from '@/store/useSerialStore';
import { createDataRecord, useMessageStore } from '@/store/useMessageStore';
import { useUiStore, type NoticeSeverity } from '@/store/useUiStore';
import { hexToBytes } from '@/utils/hex';
import { encodeTextAsync, type EncodeResult } from '@/utils/codec';
import { loadProfile, saveProfile, loadMacros } from '@/utils/storage';

/** Public API */
export interface SerialConnectionApi {
  /** Connect to backend WebSocket */
  connectBackend: () => Promise<void>;
  /** Refresh available ports */
  refreshPorts: () => Promise<void>;
  /** Connect to a serial port */
  connect: () => Promise<void>;
  /** Disconnect from serial port */
  disconnect: () => Promise<void>;
  /** Send data */
  send: (payload: string) => Promise<boolean>;
  /** Set RTS / DTR signals */
  setSignals: (s: { dataTerminalReady?: boolean; requestToSend?: boolean }) => Promise<void>;
  /** Read input signals */
  pollInputSignals: () => Promise<void>;
  /** Persist current configuration */
  persist: () => void;
  /** Restore saved configuration */
  restore: () => void;
  /** Initialize environment and auto-connect */
  initialize: () => Promise<void>;
}

/* ==========================================================================
 * Utilities
 * ========================================================================== */

/** Error code to snackbar severity */
function severityOf(err: SerialError): NoticeSeverity {
  switch (err.code) {
    case 'E_DEVICE_LOST':
    case 'E_ENCODE_FAILED':
    case 'E_STORAGE_UNAVAILABLE':
      return 'warning';
    case 'E_NO_PORT_SELECTED':
    case 'E_READ_ABORTED':
      return 'info';
    default:
      return 'error';
  }
}

/** Handle error uniformly */
function handleError(raw: unknown, fallback: Parameters<typeof SerialError.from>[1] = 'E_UNKNOWN'): SerialError {
  const err: SerialError = SerialError.from(raw, fallback);
  const ui = useUiStore.getState();

  if (err.benign) {
    ui.notify(err.message, 'info', 2000);
    return err;
  }

  useSerialStore.getState().setError(err);
  useMessageStore.getState().appendSystem(err.message, severityOf(err) === 'warning' ? 'warning' : 'error');
  ui.notify(err.message, severityOf(err));
  return err;
}

/** Collect all persistable state */
function collectProfile(): PersistedProfile {
  const serial = useSerialStore.getState();
  const message = useMessageStore.getState();
  const ui = useUiStore.getState();
  return {
    version: 1,
    config: { ...serial.config },
    sendOptions: { ...message.sendOptions },
    displayOptions: { ...message.displayOptions },
    autoSend: {
      intervalMs: ui.autoSend.intervalMs,
      repeatMode: ui.autoSend.repeatMode,
      maxCount: ui.autoSend.maxCount,
    },
    history: [...message.history],
    themeMode: ui.themeMode,
    macros: loadMacros(),
  };
}

/** Persist to localStorage */
function persist(): void {
  saveProfile(collectProfile());
}

/** Restore from localStorage */
function restore(): void {
  const profile: PersistedProfile = loadProfile();
  useSerialStore.getState().setConfig(profile.config);
  useMessageStore.getState().setSendOptions(profile.sendOptions);
  useMessageStore.getState().setDisplayOptions(profile.displayOptions);
  useMessageStore.getState().setHistory(profile.history);
  useUiStore.getState().setThemeMode(profile.themeMode);
  useUiStore.getState().setAutoSend({
    intervalMs: profile.autoSend.intervalMs,
    repeatMode: profile.autoSend.repeatMode,
    maxCount: profile.autoSend.maxCount,
  });
}

/* ==========================================================================
 * Event binding
 * ========================================================================== */

let bound: boolean = false;

/** Subscribe to SerialService events */
function bindSerialEvents(): void {
  if (bound) return;
  bound = true;

  serialService.on('open', (info: SerialOpenInfo): void => {
    const serial = useSerialStore.getState();
    serial.setConnectionState('connected');
    serial.setPortLabel(info.label);
    serial.resetStats(Date.now());
    serial.clearError();
    useMessageStore.getState().appendSystem(`已连接：${info.label}`, 'info');
    useUiStore.getState().notify(`已连接 ${info.label}`, 'success', 2500);
    persist();
  });

  serialService.on('data', (chunk: Uint8Array): void => {
    const encoding = useMessageStore.getState().displayOptions.encoding;
    useMessageStore.getState().append(createDataRecord('rx', chunk, encoding));
    useSerialStore.getState().addRx(chunk.byteLength);
  });

  serialService.on('error', (err: SerialError): void => {
    if (err.benign) return;
    useSerialStore.getState().setError(err);
    useMessageStore.getState().appendSystem(err.message, err.code === 'E_DEVICE_LOST' ? 'warning' : 'error');
    useUiStore.getState().notify(err.message, severityOf(err));
  });

  serialService.on('close', (reason: CloseReason): void => {
    const serial = useSerialStore.getState();
    serial.setConnectionState('idle');
    serial.setPortLabel('');
    serial.resetStats(null);
    serial.setOutputSignals({ dataTerminalReady: false, requestToSend: false });

    const text = reason === 'manual' ? '连接已断开' : reason === 'lost' ? '设备已断开连接' : '连接因异常关闭';
    useMessageStore.getState().appendSystem(text, reason === 'manual' ? 'info' : 'warning');
    if (reason !== 'manual') {
      useUiStore.getState().notify(text, 'warning');
    }
    persist();
  });
}

/* ==========================================================================
 * Actions
 * ========================================================================== */

/** Connect to backend WebSocket server */
async function connectBackend(): Promise<void> {
  try {
    const { getWebSocketClient } = await import('@/serial/WebSocketClient');
    const client = getWebSocketClient();
    await client.connect();
    useUiStore.getState().notify('已连接到调试服务器', 'success', 2000);
  } catch (err) {
    handleError(err, 'E_UNKNOWN');
  }
}

/** Refresh available ports from backend */
async function refreshPorts(): Promise<void> {
  const ports = await serialService.listPorts();
  useSerialStore.getState().setPorts(ports as unknown as import('@/types/serial').PortEntry[]);
}

/** Connect to selected serial port */
async function connect(): Promise<void> {
  const serial = useSerialStore.getState();
  if (serial.connectionState === 'connected' || serial.connectionState === 'connecting') {
    return;
  }

  const entry = serial.ports.find((p) => p.id === serial.selectedPortId);

  if (!entry) {
    // No port selected - show message
    handleError(new SerialError('E_NO_PORT_SELECTED', '请先选择一个端口'), 'E_NO_PORT_SELECTED');
    return;
  }

  useSerialStore.getState().setConnectionState('connecting');
  useSerialStore.getState().clearError();

  try {
    await serialService.open(entry.id, useSerialStore.getState().config);
  } catch (err) {
    handleError(err, 'E_OPEN_FAILED');
    useSerialStore.getState().setConnectionState('error');
  }
}

/** Disconnect from serial port */
async function disconnect(): Promise<void> {
  const state = useSerialStore.getState().connectionState;
  if (state !== 'connected' && state !== 'error') {
    if (!serialService.isOpen) {
      useSerialStore.getState().setConnectionState('idle');
      return;
    }
  }
  useSerialStore.getState().setConnectionState('disconnecting');
  try {
    await serialService.close('manual');
  } catch (err) {
    handleError(err, 'E_UNKNOWN');
  } finally {
    if (useSerialStore.getState().connectionState === 'disconnecting') {
      useSerialStore.getState().setConnectionState('idle');
    }
  }
}

/** Send data */
async function send(payload: string): Promise<boolean> {
  if (!serialService.isOpen) {
    handleError(new SerialError('E_NOT_CONNECTED'), 'E_NOT_CONNECTED');
    return false;
  }
  if (payload.length === 0) {
    return false;
  }

  const { sendOptions } = useMessageStore.getState();
  let bytes: Uint8Array;
  let usedEncoding = sendOptions.encoding;

  try {
    if (sendOptions.mode === 'hex') {
      bytes = hexToBytes(payload);
    } else {
      const text = payload + LINE_ENDING_TEXT[sendOptions.lineEnding];
      const result: EncodeResult = await encodeTextAsync(text, sendOptions.encoding);
      bytes = result.bytes;
      usedEncoding = result.encoding;
      if (result.degraded && result.warning) {
        useUiStore.getState().notify(result.warning, 'warning');
        useMessageStore.getState().appendSystem(result.warning, 'warning');
      }
    }
  } catch (err) {
    handleError(err, 'E_INVALID_HEX');
    return false;
  }

  try {
    const written = await serialService.write(bytes);
    useSerialStore.getState().addTx(written);
    useMessageStore.getState().append(createDataRecord('tx', bytes, usedEncoding));
    useMessageStore.getState().pushHistory(payload);
    persist();
    return true;
  } catch (err) {
    handleError(err, 'E_WRITE_FAILED');
    return false;
  }
}

/** Set output signals */
async function setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void> {
  try {
    await serialService.setSignals(s);
    useSerialStore.getState().setOutputSignals(s);
  } catch (err) {
    handleError(err, 'E_WRITE_FAILED');
  }
}

/** Poll input signals */
async function pollInputSignals(): Promise<void> {
  if (!serialService.isOpen) return;
  try {
    const signals: SerialInputSignals = await serialService.getSignals();
    useSerialStore.getState().setInputSignals({
      clearToSend: Boolean(signals.clearToSend),
      dataSetReady: Boolean(signals.dataSetReady),
      dataCarrierDetect: Boolean(signals.dataCarrierDetect),
      ringIndicator: Boolean(signals.ringIndicator),
    });
  } catch {
    // Silent fail
  }
}

let initialized: boolean = false;

/** Initialize */
async function initialize(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const result = detect();
  if (!result.supported) {
    useSerialStore.getState().setConnectionState('unsupported');
    useSerialStore.getState().setError(new SerialError(result.reason ?? 'E_UNSUPPORTED', result.detail));
    return;
  }

  restore();
  bindSerialEvents();
  useSerialStore.getState().setConnectionState('idle');

  // Connect to backend WebSocket first
  try {
    await connectBackend();
  } catch (err) {
    console.warn('[useSerialConnection] Failed to connect to backend:', err);
  }

  // Refresh ports
  await refreshPorts();

  const count = useSerialStore.getState().ports.length;
  useMessageStore.getState().appendSystem(
    count > 0
      ? `环境检测通过（${result.browser}），已发现 ${count} 个可用端口`
      : `环境检测通过（${result.browser}），等待连接设备`,
    'info',
  );
}

/* ==========================================================================
 * Hook
 * ========================================================================== */

/**
 * Serial connection hook. Returns stable API reference.
 */
export function useSerialConnection(): SerialConnectionApi {
  useEffect(() => {
    bindSerialEvents();
  }, []);

  return useMemo<SerialConnectionApi>(
    () => ({
      connectBackend,
      refreshPorts,
      connect,
      disconnect,
      send,
      setSignals,
      pollInputSignals,
      persist,
      restore,
      initialize,
    }),
    [],
  );
}

/** Global API for App mount */
export const serialConnectionApi: SerialConnectionApi = {
  connectBackend,
  refreshPorts,
  connect,
  disconnect,
  send,
  setSignals,
  pollInputSignals,
  persist,
  restore,
  initialize,
};

/** Export constant for UI */
export const MAX_MESSAGE_HINT: number = PERF.MAX_MESSAGES;