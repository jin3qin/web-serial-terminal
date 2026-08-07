/**
 * WebSocket Client for Serial Debug Tool.
 * 
 * Handles connection management, message encoding/decoding, 
 * reconnection logic, and heartbeat.
 * 
 * Zero React / Zero Zustand dependency.
 */

export interface WsClientOptions {
  /** WebSocket server URL, e.g., ws://localhost:8080/ws */
  url: string;
  /** Reconnect interval in milliseconds, default 2000 */
  reconnectInterval?: number;
  /** Maximum reconnect attempts, default 5 (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in milliseconds, default 30000 */
  heartbeatInterval?: number;
}

export interface WsCommand {
  cmd: string;
  seq: number;
  payload?: unknown;
}

export interface WsResponse {
  cmd: string;
  seq: number;
  code: number;
  message?: string;
  data?: unknown;
}

export interface WsDataEvent {
  event: string;
  payload: {
    direction: 'tx' | 'rx';
    raw: string;
    hex: string;
    text: string;
    timestamp: number;
    encoding: string;
  };
}

export type WsEventType = 'open' | 'close' | 'error' | 'data';

export interface WsEventHandlers {
  open: () => void;
  close: (reason: string) => void;
  error: (err: Error) => void;
  data: (event: WsDataEvent) => void;
}

export type WsEventHandler<K extends WsEventType = WsEventType> = K extends keyof WsEventHandlers
  ? WsEventHandlers[K]
  : never;

type PendingCallback = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * WebSocketClient manages the WebSocket connection to the Go backend.
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private seq: number = 0;
  private pending: Map<number, PendingCallback> = new Map();
  private eventHandlers: Map<WsEventType, Set<WsEventHandler>> = new Map();
  
  private readonly options: Required<WsClientOptions>;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  
  private connecting: boolean = false;
  private shouldReconnect: boolean = true;

  constructor(options: WsClientOptions) {
    this.options = {
      url: options.url,
      reconnectInterval: options.reconnectInterval ?? 2000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
    };
  }

  /**
   * Get the WebSocket URL based on current location.
   */
  public static getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? '8080' : window.location.port || '8080';
    return `${protocol}//${host}:${port}/ws`;
  }

  /**
   * Connect to the WebSocket server.
   */
  public connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    
    if (this.connecting) {
      return Promise.reject(new Error('Connection in progress'));
    }

    this.connecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.url);
      
      ws.onopen = () => {
        this.ws = ws;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('open');
        resolve();
      };

      ws.onclose = (event) => {
        this.connecting = false;
        this.ws = null;
        this.stopHeartbeat();
        
        const reason = event.reason || 'Connection closed';
        this.emit('close', reason);

        // Attempt reconnect
        if (this.shouldReconnect && this.canReconnect()) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = (err) => {
        this.connecting = false;
        const error = new Error('WebSocket error');
        this.emit('error', error);
        
        if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) {
          reject(error);
        }
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Disconnect from the WebSocket server.
   */
  public disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Reject all pending callbacks
    for (const [seq, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pending.clear();
  }

  /**
   * Check if connected.
   */
  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a command and wait for response.
   */
  public send<T = unknown>(cmd: string, payload?: unknown, timeout: number = 10000): Promise<T> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Not connected'));
    }

    const seq = this.nextSeq();
    const message: WsCommand = { cmd, seq, payload };

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error('Command timeout'));
      }, timeout);

      // Store pending callback
      this.pending.set(seq, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
      });

      // Send message
      try {
        this.ws!.send(JSON.stringify(message));
      } catch (err) {
        this.pending.delete(seq);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Subscribe to events.
   */
  public on<K extends WsEventType>(event: K, handler: WsEventHandler<K>): () => void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler as WsEventHandler);

    // Return unsubscribe function
    return () => {
      const h = this.eventHandlers.get(event);
      if (h) {
        h.delete(handler as WsEventHandler);
      }
    };
  }

  /**
   * Handle incoming message.
   */
  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      // Check if it's a response to a command
      if ('seq' in parsed && 'code' in parsed) {
        const response = parsed as WsResponse;
        const pending = this.pending.get(response.seq);
        
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(response.seq);

          if (response.code === 0) {
            pending.resolve(response.data);
          } else {
            const err = new Error(response.message || `Error code: ${response.code}`);
            (err as any).code = response.code;
            pending.reject(err);
          }
        }
        return;
      }

      // Check if it's a data event
      if ('event' in parsed) {
        this.emit('data', parsed as WsDataEvent);
        return;
      }

    } catch (err) {
      console.error('[WebSocketClient] Failed to parse message:', err);
    }
  }

  /**
   * Emit an event to handlers.
   */
  private emit<K extends WsEventType>(event: K, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;

    for (const handler of Array.from(handlers)) {
      try {
        (handler as any)(...args);
      } catch (err) {
        console.error(`[WebSocketClient] Handler error for ${event}:`, err);
      }
    }
  }

  /**
   * Get next sequence number.
   */
  private nextSeq(): number {
    return ++this.seq;
  }

  /**
   * Start heartbeat timer.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    let consecutiveFailures = 0;
    const maxFailures = 3;

    this.heartbeatTimer = setInterval(async () => {
      if (this.isConnected()) {
        try {
          // Send ping command to backend (10s timeout)
          await this.send('ping', undefined, 10000);
          consecutiveFailures = 0; // Reset on success
        } catch (err) {
          consecutiveFailures++;
          console.warn(`[WebSocketClient] Heartbeat failed (${consecutiveFailures}/${maxFailures}):`, err);

          // Only trigger reconnect after consecutive failures
          if (consecutiveFailures >= maxFailures) {
            console.error('[WebSocketClient] Too many heartbeat failures, reconnecting...');
            this.handleHeartbeatFailure();
          }
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Handle heartbeat failure - trigger reconnection.
   */
  private handleHeartbeatFailure(): void {
    if (this.ws) {
      // Use valid close code (1000 = normal closure, or 3000+ for custom)
      // 1006 is reserved and cannot be used manually
      this.ws.close(3000, 'Heartbeat timeout');
    }
  }

  /**
   * Stop heartbeat timer.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Check if can attempt reconnect.
   */
  private canReconnect(): boolean {
    if (this.options.maxReconnectAttempts === 0) return true;
    return this.reconnectAttempts < this.options.maxReconnectAttempts;
  }

  /**
   * Schedule a reconnect attempt.
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    this.reconnectAttempts++;
    console.log(`[WebSocketClient] Reconnecting in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect failed, will retry if shouldReconnect
      });
    }, this.options.reconnectInterval);
  }

  /**
   * Clear reconnect timer.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Global singleton instance
let wsClient: WebSocketClient | null = null;

/**
 * Get the global WebSocket client instance.
 */
export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient({
      url: WebSocketClient.getWebSocketUrl(),
      reconnectInterval: 2000,
      maxReconnectAttempts: 5,
    });
  }
  return wsClient;
}