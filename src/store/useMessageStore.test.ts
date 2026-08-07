/**
 * `@/store/useMessageStore` 单元测试。
 *
 * 覆盖 T02 验收点 4（环形缓冲 5000 上限，保留最新）与 §8.6 性能约定。
 * Zustand store 为模块级单例，因此每个用例前手动复位状态。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDataRecord,
  createSystemRecord,
  useMessageStore,
} from '@/store/useMessageStore';
import {
  DEFAULT_DISPLAY_OPTIONS,
  DEFAULT_SEND_OPTIONS,
  PERF,
  type MessageRecord,
} from '@/types/serial';

/** 复位 store 到初始状态 */
function resetStore(): void {
  useMessageStore.setState({
    messages: [],
    maxRecords: PERF.MAX_MESSAGES,
    displayOptions: { ...DEFAULT_DISPLAY_OPTIONS },
    sendOptions: { ...DEFAULT_SEND_OPTIONS },
    history: [],
    draft: '',
  });
}

/** 造一条带序号的 rx 消息（序号写入 raw 首字节的低 8 位，便于断言顺序） */
function makeRecord(index: number): MessageRecord {
  const rec: MessageRecord = createDataRecord('rx', Uint8Array.from([index & 0xff]), 'utf-8');
  return { ...rec, note: `#${index}` };
}

beforeEach(() => {
  resetStore();
});

describe('createDataRecord / createSystemRecord', () => {
  it('数据消息携带 raw 字节与 byteLength', () => {
    const raw = Uint8Array.from([1, 2, 3]);
    const rec: MessageRecord = createDataRecord('tx', raw, 'utf-8');
    expect(rec.direction).toBe('tx');
    expect(rec.raw).toBe(raw);
    expect(rec.byteLength).toBe(3);
    expect(rec.encoding).toBe('utf-8');
    expect(typeof rec.timestamp).toBe('number');
  });

  it('每条消息 id 唯一', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      ids.add(createDataRecord('rx', new Uint8Array(1), 'utf-8').id);
    }
    expect(ids.size).toBe(200);
  });

  it('系统消息 raw 为空、direction 为 system、可带级别', () => {
    const rec: MessageRecord = createSystemRecord('已连接', 'warning');
    expect(rec.direction).toBe('system');
    expect(rec.byteLength).toBe(0);
    expect(rec.raw).toHaveLength(0);
    expect(rec.note).toBe('已连接');
    expect(rec.level).toBe('warning');
  });

  it('系统消息默认级别为 info', () => {
    expect(createSystemRecord('x').level).toBe('info');
  });
});

describe('环形缓冲（T02 验收点 4）', () => {
  it('默认上限为 PERF.MAX_MESSAGES = 5000', () => {
    expect(useMessageStore.getState().maxRecords).toBe(5000);
    expect(PERF.MAX_MESSAGES).toBe(5000);
  });

  it('连续 append 6000 条后 length === 5000 且保留最新', () => {
    const { append } = useMessageStore.getState();
    for (let i = 0; i < 6000; i += 1) {
      append(makeRecord(i));
    }

    const messages: MessageRecord[] = useMessageStore.getState().messages;
    expect(messages).toHaveLength(5000);
    // 保留最新 → 首条应为 #1000，末条应为 #5999
    expect(messages[0].note).toBe('#1000');
    expect(messages[messages.length - 1].note).toBe('#5999');
  });

  it('appendMany 批量写入同样受上限约束', () => {
    const batch: MessageRecord[] = Array.from({ length: 6000 }, (_, i) => makeRecord(i));
    useMessageStore.getState().appendMany(batch);

    const messages: MessageRecord[] = useMessageStore.getState().messages;
    expect(messages).toHaveLength(5000);
    expect(messages[0].note).toBe('#1000');
    expect(messages[4999].note).toBe('#5999');
  });

  it('appendMany 空数组不触发状态变更（引用不变）', () => {
    useMessageStore.getState().append(makeRecord(1));
    const before: MessageRecord[] = useMessageStore.getState().messages;
    useMessageStore.getState().appendMany([]);
    expect(useMessageStore.getState().messages).toBe(before);
  });

  it('未超限时不裁剪', () => {
    for (let i = 0; i < 10; i += 1) {
      useMessageStore.getState().append(makeRecord(i));
    }
    expect(useMessageStore.getState().messages).toHaveLength(10);
  });

  it('恰好等于上限时不裁剪', () => {
    useMessageStore.setState({ maxRecords: 10 });
    useMessageStore.getState().appendMany(Array.from({ length: 10 }, (_, i) => makeRecord(i)));
    expect(useMessageStore.getState().messages).toHaveLength(10);
    expect(useMessageStore.getState().messages[0].note).toBe('#0');
  });

  it('appendSystem 也计入环形缓冲', () => {
    useMessageStore.setState({ maxRecords: 3 });
    const { appendSystem } = useMessageStore.getState();
    appendSystem('a');
    appendSystem('b');
    appendSystem('c');
    appendSystem('d');
    const messages: MessageRecord[] = useMessageStore.getState().messages;
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.note)).toEqual(['b', 'c', 'd']);
  });

  it('clear 清空消息', () => {
    useMessageStore.getState().append(makeRecord(1));
    useMessageStore.getState().clear();
    expect(useMessageStore.getState().messages).toHaveLength(0);
  });

  it('每次 append 都产生新数组引用（保证 React 订阅可感知）', () => {
    const before: MessageRecord[] = useMessageStore.getState().messages;
    useMessageStore.getState().append(makeRecord(1));
    expect(useMessageStore.getState().messages).not.toBe(before);
  });
});

describe('draft', () => {
  it('初始为空串', () => {
    expect(useMessageStore.getState().draft).toBe('');
  });

  it('setDraft 更新草稿', () => {
    useMessageStore.getState().setDraft('AT+RST');
    expect(useMessageStore.getState().draft).toBe('AT+RST');
  });

  it('setDraft 可清空', () => {
    useMessageStore.getState().setDraft('x');
    useMessageStore.getState().setDraft('');
    expect(useMessageStore.getState().draft).toBe('');
  });

  it('setDraft 不影响 messages', () => {
    useMessageStore.getState().append(makeRecord(1));
    useMessageStore.getState().setDraft('hello');
    expect(useMessageStore.getState().messages).toHaveLength(1);
  });
});

describe('displayOptions / sendOptions', () => {
  it('局部更新显示选项，其余字段保留', () => {
    useMessageStore.getState().setDisplayOptions({ displayMode: 'hex' });
    const opt = useMessageStore.getState().displayOptions;
    expect(opt.displayMode).toBe('hex');
    expect(opt.showTimestamp).toBe(DEFAULT_DISPLAY_OPTIONS.showTimestamp);
    expect(opt.encoding).toBe(DEFAULT_DISPLAY_OPTIONS.encoding);
  });

  it('局部更新发送选项，其余字段保留', () => {
    useMessageStore.getState().setSendOptions({ mode: 'hex' });
    const opt = useMessageStore.getState().sendOptions;
    expect(opt.mode).toBe('hex');
    expect(opt.lineEnding).toBe(DEFAULT_SEND_OPTIONS.lineEnding);
  });

  it('默认值符合设计文档 §3.1', () => {
    expect(useMessageStore.getState().sendOptions).toEqual({
      mode: 'text',
      encoding: 'utf-8',
      lineEnding: 'none',
    });
    expect(useMessageStore.getState().displayOptions).toEqual({
      displayMode: 'ascii',
      encoding: 'utf-8',
      showTimestamp: true,
      autoScroll: true,
      hexBytesPerLine: 16,
    });
  });
});

describe('发送历史', () => {
  it('pushHistory 最新在前', () => {
    const { pushHistory } = useMessageStore.getState();
    pushHistory('a');
    pushHistory('b');
    expect(useMessageStore.getState().history).toEqual(['b', 'a']);
  });

  it('pushHistory 去重并提升到首位', () => {
    const { pushHistory } = useMessageStore.getState();
    pushHistory('a');
    pushHistory('b');
    pushHistory('a');
    expect(useMessageStore.getState().history).toEqual(['a', 'b']);
  });

  it('pushHistory 忽略空串', () => {
    useMessageStore.getState().pushHistory('');
    expect(useMessageStore.getState().history).toHaveLength(0);
  });

  it('上限 50 条，超出丢弃最旧', () => {
    const { pushHistory } = useMessageStore.getState();
    for (let i = 0; i < 60; i += 1) {
      pushHistory(`cmd-${i}`);
    }
    const history: string[] = useMessageStore.getState().history;
    expect(history).toHaveLength(PERF.MAX_HISTORY);
    expect(history[0]).toBe('cmd-59');
    expect(history[49]).toBe('cmd-10');
  });

  it('setHistory 覆盖并截断到 50', () => {
    useMessageStore.getState().setHistory(Array.from({ length: 80 }, (_, i) => `h${i}`));
    expect(useMessageStore.getState().history).toHaveLength(50);
    expect(useMessageStore.getState().history[0]).toBe('h0');
  });

  it('removeHistory 删除指定项', () => {
    useMessageStore.getState().setHistory(['a', 'b', 'c']);
    useMessageStore.getState().removeHistory('b');
    expect(useMessageStore.getState().history).toEqual(['a', 'c']);
  });

  it('removeHistory 删除不存在项不报错', () => {
    useMessageStore.getState().setHistory(['a']);
    expect(() => useMessageStore.getState().removeHistory('zzz')).not.toThrow();
    expect(useMessageStore.getState().history).toEqual(['a']);
  });

  it('clearHistory 清空', () => {
    useMessageStore.getState().setHistory(['a', 'b']);
    useMessageStore.getState().clearHistory();
    expect(useMessageStore.getState().history).toHaveLength(0);
  });
});
