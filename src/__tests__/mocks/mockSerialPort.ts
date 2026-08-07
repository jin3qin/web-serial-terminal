/**
 * Web Serial API 测试替身。
 *
 * 目标：在无真机、无浏览器的条件下，尽可能真实地模拟 §8.8 踩坑清单中的行为，
 * 从而让 `SerialService` 的关闭协议 / 合帧 / 异常兜底逻辑可被断言：
 *
 * - `reader.read()` 在 `cancel()` 后 **resolve 为 {done:true}**，而不是 reject（红线 3）；
 * - `reader.releaseLock()` 在仍有 pending read 时 **抛 TypeError**（真实规范行为）；
 * - `port.close()` 在读/写锁未释放时 **抛 InvalidStateError: The port is already locked**（红线 2）；
 * - 设备拔出时 `read()` 抛 `DOMException('...', 'NetworkError')`（红线 4）。
 *
 * 所有关键调用都写入共享的 `log` 数组，用于断言 §4.1 的七步顺序。
 */

/** 构造一个带 name 的 DOMException（jsdom 已实现 DOMException） */
export function domException(name: string, message: string = name): DOMException {
  return new DOMException(message, name);
}

type ReadResult = ReadableStreamReadResult<Uint8Array>;

/** 可控的 ReadableStreamDefaultReader 替身 */
export class FakeReader {
  public cancelCount = 0;
  public releaseCount = 0;
  public readCount = 0;

  private readonly queue: Uint8Array[] = [];
  private waiter: { resolve: (v: ReadResult) => void; reject: (e: unknown) => void } | null = null;
  private done = false;
  /** 预置的一次性读取异常（模拟设备拔出） */
  private pendingError: unknown = null;

  constructor(
    private readonly log: string[],
    private readonly onRelease: () => void,
  ) {}

  /** 是否有未完成的 read()（用于模拟 releaseLock 的规范限制） */
  public get hasPendingRead(): boolean {
    return this.waiter !== null;
  }

  public read(): Promise<ReadResult> {
    this.readCount += 1;
    if (this.pendingError !== null) {
      const err: unknown = this.pendingError;
      this.pendingError = null;
      return Promise.reject(err);
    }
    if (this.queue.length > 0) {
      return Promise.resolve({ value: this.queue.shift() as Uint8Array, done: false });
    }
    if (this.done) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise<ReadResult>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  /** 模拟设备推来一片数据 */
  public push(bytes: Uint8Array): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve({ value: bytes, done: false });
      return;
    }
    this.queue.push(bytes);
  }

  /** 模拟设备被拔出：下一次（或当前挂起的）read 抛 NetworkError */
  public failWith(err: unknown): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err);
      return;
    }
    this.pendingError = err;
  }

  /** 模拟流自然结束（设备侧关闭） */
  public endStream(): void {
    this.done = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve({ value: undefined, done: true });
    }
  }

  public cancel(): Promise<void> {
    this.cancelCount += 1;
    this.log.push('reader.cancel');
    this.done = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      // 红线 3：cancel 后 read() resolve 为 {done:true}，不是 reject
      w.resolve({ value: undefined, done: true });
    }
    return Promise.resolve();
  }

  public releaseLock(): void {
    if (this.waiter !== null) {
      // 真实规范：仍有 pending read 时 releaseLock 抛 TypeError
      throw new TypeError('Cannot release a readable stream reader when it still has outstanding read() calls');
    }
    this.releaseCount += 1;
    this.log.push('reader.releaseLock');
    this.onRelease();
  }
}

/** 可控的 WritableStreamDefaultWriter 替身 */
export class FakeWriter {
  public writes: Uint8Array[] = [];
  public closeCount = 0;
  public releaseCount = 0;
  public released = false;
  /** 预置写入异常 */
  public writeError: unknown = null;
  /** 每次 write 的人为延时（毫秒），用于验证串行化 */
  public writeDelayMs = 0;

  constructor(
    private readonly log: string[],
    private readonly onRelease: () => void,
  ) {}

  public async write(chunk: Uint8Array): Promise<void> {
    if (this.released) {
      throw new TypeError('Cannot write to a released writer');
    }
    if (this.writeError !== null) {
      const e: unknown = this.writeError;
      this.writeError = null;
      throw e;
    }
    if (this.writeDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.writeDelayMs));
    }
    this.writes.push(new Uint8Array(chunk));
    this.log.push(`writer.write:${chunk.byteLength}`);
  }

  public close(): Promise<void> {
    this.closeCount += 1;
    this.log.push('writer.close');
    return Promise.resolve();
  }

  public releaseLock(): void {
    this.releaseCount += 1;
    this.released = true;
    this.log.push('writer.releaseLock');
    this.onRelease();
  }
}

export interface MockPortOptions {
  usbVendorId?: number;
  usbProductId?: number;
  /** port.open() 抛出的异常 */
  openError?: unknown;
  /** port.close() 抛出的异常 */
  closeError?: unknown;
  /** 打开后 readable / writable 为 null，触发绑定失败回滚分支 */
  streamsUnavailable?: boolean;
}

/** SerialPort 替身 */
export class MockSerialPort {
  public readonly log: string[] = [];
  public opened = false;
  public openCount = 0;
  public closeCount = 0;
  public openOptions: SerialOptions | null = null;

  public reader: FakeReader | null = null;
  public writer: FakeWriter | null = null;
  public readerLocked = false;
  public writerLocked = false;

  public signalsSet: Array<{ dataTerminalReady?: boolean; requestToSend?: boolean }> = [];
  public inputSignals: SerialInputSignals = {
    clearToSend: true,
    dataCarrierDetect: false,
    dataSetReady: true,
    ringIndicator: false,
  };

  public readable: { getReader: () => FakeReader } | null = null;
  public writable: { getWriter: () => FakeWriter } | null = null;

  constructor(private readonly opts: MockPortOptions = {}) {}

  public getInfo(): SerialPortInfo {
    return {
      usbVendorId: this.opts.usbVendorId,
      usbProductId: this.opts.usbProductId,
    };
  }

  public async open(options: SerialOptions): Promise<void> {
    this.openCount += 1;
    this.log.push('port.open');
    if (this.opts.openError) {
      throw this.opts.openError;
    }
    if (this.opened) {
      throw domException('InvalidStateError', 'The port is already open.');
    }
    this.openOptions = options;
    this.opened = true;

    if (this.opts.streamsUnavailable) {
      this.readable = null;
      this.writable = null;
      return;
    }

    this.readable = {
      getReader: (): FakeReader => {
        if (this.readerLocked) {
          throw new TypeError('ReadableStream is locked');
        }
        this.readerLocked = true;
        this.reader = new FakeReader(this.log, () => {
          this.readerLocked = false;
        });
        return this.reader;
      },
    };
    this.writable = {
      getWriter: (): FakeWriter => {
        if (this.writerLocked) {
          throw new TypeError('WritableStream is locked');
        }
        this.writerLocked = true;
        this.writer = new FakeWriter(this.log, () => {
          this.writerLocked = false;
        });
        return this.writer;
      },
    };
  }

  public async close(): Promise<void> {
    this.closeCount += 1;
    this.log.push('port.close');
    // 红线 2：锁未释放时真实浏览器会抛 InvalidStateError
    if (this.readerLocked || this.writerLocked) {
      throw domException('InvalidStateError', 'The port is already locked.');
    }
    if (this.opts.closeError) {
      throw this.opts.closeError;
    }
    this.opened = false;
  }

  public async setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void> {
    this.signalsSet.push(s);
  }

  public async getSignals(): Promise<SerialInputSignals> {
    return this.inputSignals;
  }
}

/** 安装一个可控的 navigator.serial 替身，返回卸载函数 */
export function installNavigatorSerial(ports: MockSerialPort[] = []): {
  target: EventTarget & {
    getPorts: () => Promise<SerialPort[]>;
    requestPort: (o?: unknown) => Promise<SerialPort>;
  };
  restore: () => void;
  setRequestResult: (fn: () => Promise<SerialPort>) => void;
} {
  const bus = new EventTarget();
  let requestImpl: () => Promise<SerialPort> = async (): Promise<SerialPort> => {
    throw domException('NotFoundError', 'No port selected by the user.');
  };

  const fake = Object.assign(bus, {
    getPorts: async (): Promise<SerialPort[]> => ports as unknown as SerialPort[],
    requestPort: async (): Promise<SerialPort> => requestImpl(),
  });

  const had: boolean = 'serial' in navigator;
  const previous: unknown = (navigator as unknown as Record<string, unknown>).serial;

  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    writable: true,
    value: fake,
  });

  return {
    target: fake,
    restore: (): void => {
      if (had) {
        Object.defineProperty(navigator, 'serial', {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else {
        delete (navigator as unknown as Record<string, unknown>).serial;
      }
    },
    setRequestResult: (fn: () => Promise<SerialPort>): void => {
      requestImpl = fn;
    },
  };
}

/** 让出事件循环若干次，等待 read loop 的 microtask 推进 */
export async function flushMicrotasks(times: number = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

/** 真实等待若干毫秒（用于 30ms 合帧静默窗口） */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
