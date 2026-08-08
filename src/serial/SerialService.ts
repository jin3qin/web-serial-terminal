/**
 * Serial Service - WebSocket-based implementation.
 * 
 * Refactored from Web Serial API to WebSocket communication.
 * Interface remains unchanged for backward compatibility.
 * 
 * Zero React / Zero Zustand dependency.
 */

import {
  PERF,
  SerialError,
  type CloseReason,
  type SerialConfig,
  type SerialEventName,
  type SerialServiceEvents,
  type SerialInputSignals,
  type Unsubscribe,
} from '@/types/serial';
import { getWebSocketClient, WebSocketClient, type WsDataEvent } from './WebSocketClient';

/** Port information from backend */
interface BackendPortInfo {
  name: string;
  description: string;
  vid?: string;
  pid?: string;
}

/** Port entry for UI */
export interface PortEntry {
  id: string;
  label: string;
  name: string;
  description: string;
}

/** Empty operation for catch fallback */
function noop(): void {}

/**
 * SerialService provides serial port functionality via WebSocket.
 */
export class SerialService {
  private client: WebSocketClient;
  private opened: boolean = false;
  private portLabel: string = '';
  
  /** Event listeners */
  private readonly listeners: Map<SerialEventName, Set<(payload: never) => void>> = new Map();
  
  /** Unsubscribe functions */
  private unsubData: (() => void) | null = null;
  private unsubClose: (() => void) | null = null;

  constructor() {
    this.client = getWebSocketClient();
  }

  /* ======================================================================
   * Read-only state
   * ====================================================================== */

  /** Current connection state */
  public get isOpen(): boolean {
    return this.opened && this.client.isConnected();
  }

  /** Current port friendly name */
  public get label(): string {
    return this.portLabel;
  }

  /* ======================================================================
   * Event bus
   * ====================================================================== */

  /**
   * Subscribe to events.
   */
  public on<K extends SerialEventName>(event: K, cb: SerialServiceEvents[K]): Unsubscribe {
    let set: Set<(payload: never) => void> | undefined = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as unknown as (payload: never) => void);
    return () => {
      const current = this.listeners.get(event);
      if (current) {
        current.delete(cb as unknown as (payload: never) => void);
      }
    };
  }

  /** Remove all listeners */
  public removeAllListeners(): void {
    this.listeners.clear();
  }

  /** Emit event to listeners */
  private emit<K extends SerialEventName>(event: K, payload: Parameters<SerialServiceEvents[K]>[0]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    
    for (const cb of Array.from(set)) {
      try {
        (cb as (p: typeof payload) => void)(payload);
      } catch (err) {
        console.error('[SerialService] Listener error:', err);
      }
    }
  }

  /* ======================================================================
   * Port enumeration
   * ====================================================================== */

  /**
   * List available serial ports.
   * Returns an array of PortEntry objects.
   */
  public async listPorts(): Promise<PortEntry[]> {
    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    try {
      const response = await this.client.send<{ ports: BackendPortInfo[] }>('list_ports');
      
      return response.ports.map((p, index) => ({
        id: p.name,
        label: p.description || p.name,
        name: p.name,
        description: p.description || p.name,
      }));
    } catch (err) {
      console.error('[SerialService] Failed to list ports:', err);
      return [];
    }
  }

  /**
   * Request port selection (no longer needed with WebSocket).
   * Kept for backward compatibility - does nothing.
   */
  public async requestPort(): Promise<void> {
    // No longer needed - ports are enumerated via listPorts
    return;
  }

  /**
   * List granted ports (alias for listPorts).
   */
  public async listGrantedPorts(): Promise<PortEntry[]> {
    return this.listPorts();
  }

  /* ======================================================================
   * Connection
   * ====================================================================== */

  /**
   * Open a serial port.
   * 
   * @param portName Port identifier (e.g., "COM3" or "/dev/ttyUSB0")
   * @param config Serial port configuration
   */
  public async open(portName: string | PortEntry, config: SerialConfig): Promise<void> {
    if (this.opened) {
      throw new SerialError('E_ALREADY_OPEN');
    }

    // Get port name
    const name = typeof portName === 'string' ? portName : portName.name;

    // Ensure WebSocket connection
    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    // Setup data event handler before connecting
    // Note: Only process RX data. TX data is already recorded in send() to avoid duplicates.
    this.unsubData = this.client.on('data', (event: WsDataEvent) => {
      if (event.event === 'data' && event.payload && event.payload.direction === 'rx') {
        const payload = event.payload;
        // Convert base64 raw data to Uint8Array
        const bytes = this.base64ToBytes(payload.raw);
        this.emit('data', bytes);
      }
    });

    // Setup close handler
    this.unsubClose = this.client.on('close', () => {
      if (this.opened) {
        this.opened = false;
        this.portLabel = '';
        this.emit('close', 'lost');
      }
    });

    try {
      const response = await this.client.send('connect', {
        port: name,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        flowControl: config.flowControl,
      });

      this.opened = true;
      this.portLabel = name;
      this.emit('open', { label: name });
      
    } catch (err: any) {
      this.cleanupHandlers();
      
      const code = err?.code || 1002;
      let errorCode: SerialError['code'] = 'E_OPEN_FAILED';
      
      if (code === 1001) errorCode = 'E_NO_PORT_SELECTED';
      else if (code === 1002) errorCode = 'E_OPEN_FAILED';
      else if (code === 1004) errorCode = 'E_ALREADY_OPEN';
      
      throw new SerialError(errorCode, err?.message || 'Failed to open port');
    }
  }

  /**
   * Close the serial port.
   */
  public async close(reason: CloseReason = 'manual'): Promise<void> {
    if (!this.opened) {
      return;
    }

    try {
      await this.client.send('disconnect');
    } catch (err) {
      // Ignore disconnect errors
    }

    this.opened = false;
    this.portLabel = '';
    this.cleanupHandlers();
    this.emit('close', reason);
  }

  /**
   * Write data to the serial port.
   */
  public async write(bytes: Uint8Array): Promise<number> {
    if (!this.opened) {
      throw new SerialError('E_NOT_CONNECTED');
    }

    // Convert bytes to hex string (e.g., "48 65 6C 6C 6F")
    const hexStr = this.bytesToHex(bytes);
    
    try {
      const response = await this.client.send('send', {
        mode: 'hex',
        data: hexStr,
      });
      
      return bytes.byteLength;
    } catch (err: any) {
      throw new SerialError('E_WRITE_FAILED', err?.message);
    }
  }

  /* ======================================================================
   * Control signals
   * ====================================================================== */

  /**
   * Set output control signals (DTR / RTS).
   */
  public async setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void> {
    if (!this.opened) {
      throw new SerialError('E_NOT_CONNECTED');
    }

    try {
      await this.client.send('set_signals', {
        dtr: s.dataTerminalReady ?? false,
        rts: s.requestToSend ?? false,
      });
    } catch (err: any) {
      throw new SerialError('E_WRITE_FAILED', err?.message);
    }
  }

  /**
   * Get input control signals (CTS / DSR / DCD / RI).
   */
  public async getSignals(): Promise<SerialInputSignals> {
    if (!this.opened) {
      throw new SerialError('E_NOT_CONNECTED');
    }

    try {
      const response = await this.client.send<{
        cts: boolean;
        dsr: boolean;
        dcd: boolean;
        ri: boolean;
      }>('get_signals');

      return {
        clearToSend: response.cts,
        dataSetReady: response.dsr,
        dataCarrierDetect: response.dcd,
        ringIndicator: response.ri,
      };
    } catch (err: any) {
      throw new SerialError('E_DEVICE_LOST', err?.message);
    }
  }

  /* ======================================================================
   * Utilities
   * ====================================================================== */

  /** Convert bytes to base64 */
  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Convert base64 to bytes */
  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /** Convert bytes to space-separated hex string */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  }

  /** Cleanup event handlers */
  private cleanupHandlers(): void {
    if (this.unsubData) {
      this.unsubData();
      this.unsubData = null;
    }
    if (this.unsubClose) {
      this.unsubClose();
      this.unsubClose = null;
    }
  }
}

/** Global singleton */
export const serialService = new SerialService();

// PortEntry is already exported as interface at line 31