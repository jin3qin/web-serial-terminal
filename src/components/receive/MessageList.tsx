/**
 * 虚拟滚动消息列表：固定行高 + 收发着色 + 等宽字体。
 *
 * 展示内容完全由 `MessageRecord.raw` 与 `DisplayOptions` 投影得出，
 * 因此切换 ASCII/HEX 或编码后，历史消息会同步刷新（§8.1）。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { FixedSizeList, type ListChildComponentProps, type ListOnScrollProps } from 'react-window';
import { PERF, type DisplayOptions, type MessageRecord } from '@/types/serial';
import { DIRECTION_COLORS, MONO_FONT_STACK, type DirectionPalette } from '@/theme/theme';
import { formatTime, renderMessageBody } from '@/utils/format';

/** 传给行渲染器的数据 */
interface RowData {
  messages: readonly MessageRecord[];
  display: DisplayOptions;
  colors: DirectionPalette;
}

/** 方向前缀符号 */
const DIRECTION_MARK: Record<MessageRecord['direction'], string> = {
  tx: '→',
  rx: '←',
  system: '·',
};

/**
 * 取一条消息的展示颜色。
 *
 * @param m 消息
 * @param colors 主题配色
 */
function colorOf(m: MessageRecord, colors: DirectionPalette): string {
  if (m.direction === 'tx') {
    return colors.tx;
  }
  if (m.direction === 'rx') {
    return colors.rx;
  }
  if (m.level === 'error') {
    return colors.systemError;
  }
  if (m.level === 'warning') {
    return colors.systemWarning;
  }
  return colors.system;
}

/** 单行渲染 */
function Row({ index, style, data }: ListChildComponentProps<RowData>): JSX.Element {
  const { messages, display, colors } = data;
  const m: MessageRecord = messages[index];
  const color: string = colorOf(m, colors);
  const body: string = renderMessageBody(m, display);

  return (
    <div style={style} className="spdt-mono spdt-row" title={body}>
      {display.showTimestamp ? (
        <span style={{ color: colors.system, marginRight: 8 }}>[{formatTime(m.timestamp)}]</span>
      ) : null}
      <span style={{ color, marginRight: 6 }}>{DIRECTION_MARK[m.direction]}</span>
      <span style={{ color }}>{body}</span>
      {m.direction !== 'system' ? (
        <span style={{ color: colors.system, marginLeft: 8 }}>({m.byteLength}B)</span>
      ) : null}
    </div>
  );
}

/** 组件属性 */
export interface MessageListProps {
  messages: readonly MessageRecord[];
  display: DisplayOptions;
}

/** 虚拟滚动消息列表 */
export default function MessageList({ messages, display }: MessageListProps): JSX.Element {
  const theme = useTheme();
  const colors: DirectionPalette =
    DIRECTION_COLORS[theme.palette.mode === 'dark' ? 'dark' : 'light'];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<FixedSizeList<RowData> | null>(null);
  const atBottomRef = useRef<boolean>(true);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // 监听容器尺寸，替代 AutoSizer（不额外引依赖）
  useLayoutEffect(() => {
    const el: HTMLDivElement | null = containerRef.current;
    if (!el) {
      return;
    }
    const update = (): void => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return (): void => {
      observer.disconnect();
    };
  }, []);

  // 自动滚动到底部：仅当开关开启且用户未手动上滚
  useEffect(() => {
    if (!display.autoScroll || messages.length === 0) {
      return;
    }
    if (!atBottomRef.current) {
      return;
    }
    listRef.current?.scrollToItem(messages.length - 1, 'end');
  }, [messages, display.autoScroll]);

  /** 记录用户是否处于底部（§8.6：手动上滚时暂停自动滚动） */
  const handleScroll = useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps): void => {
      if (scrollUpdateWasRequested) {
        return;
      }
      const total: number = messages.length * PERF.ROW_HEIGHT;
      const maxOffset: number = Math.max(0, total - size.height);
      atBottomRef.current = scrollOffset >= maxOffset - PERF.ROW_HEIGHT;
    },
    [messages.length, size.height],
  );

  return (
    <div ref={containerRef} className="relative min-h-0 grow">
      {messages.length === 0 ? (
        <Box className="flex h-full w-full items-center justify-center">
          <Typography variant="caption" color="text.secondary">
            暂无数据。连接串口后收发的报文将显示在这里。
          </Typography>
        </Box>
      ) : size.height > 0 && size.width > 0 ? (
        <FixedSizeList<RowData>
          ref={listRef}
          height={size.height}
          width={size.width}
          itemCount={messages.length}
          itemSize={PERF.ROW_HEIGHT}
          overscanCount={12}
          onScroll={handleScroll}
          itemKey={(index: number, data: RowData) => data.messages[index].id}
          itemData={{ messages, display, colors }}
          style={{ fontFamily: MONO_FONT_STACK }}
        >
          {Row}
        </FixedSizeList>
      ) : null}
    </div>
  );
}
