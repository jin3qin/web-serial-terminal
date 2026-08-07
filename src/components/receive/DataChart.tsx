/**
 * 数据曲线（P2-2 预留）。
 *
 * MVP 暂缓完整实现：解析规则强依赖用户实际协议，需真实报文样本后定规则。
 * 当前提供最小可用版本：按行提取第一个数值（形如 `12.34` / `-5`），
 * 用 SVG 折线展示最近 N 个采样点，不引入图表库。
 */

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { MessageRecord } from '@/types/serial';
import { decodeText } from '@/utils/codec';

/** 最多绘制的采样点数 */
const MAX_POINTS = 200;

/** 图表高度（px） */
const CHART_HEIGHT = 120;

export interface DataChartProps {
  messages: readonly MessageRecord[];
}

/**
 * 从接收消息中提取数值序列（每条 rx 消息取第一个可解析数值）。
 *
 * @param messages 消息列表
 * @returns 数值数组
 */
function extractSeries(messages: readonly MessageRecord[]): number[] {
  const values: number[] = [];
  for (let i = messages.length - 1; i >= 0 && values.length < MAX_POINTS; i -= 1) {
    const m: MessageRecord = messages[i];
    if (m.direction !== 'rx') {
      continue;
    }
    const text: string = decodeText(m.raw, m.encoding);
    const match: RegExpMatchArray | null = text.match(/-?\d+(\.\d+)?/);
    if (match) {
      const num: number = Number(match[0]);
      if (Number.isFinite(num)) {
        values.push(num);
      }
    }
  }
  return values.reverse();
}

/** 数据曲线面板 */
export default function DataChart({ messages }: DataChartProps): JSX.Element {
  const theme = useTheme();
  const series: number[] = useMemo(() => extractSeries(messages), [messages]);

  const path: string = useMemo(() => {
    if (series.length < 2) {
      return '';
    }
    const min: number = Math.min(...series);
    const max: number = Math.max(...series);
    const range: number = max - min || 1;
    const stepX: number = 100 / (series.length - 1);
    return series
      .map((v, i) => {
        const x: number = i * stepX;
        const y: number = 100 - ((v - min) / range) * 100;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [series]);

  return (
    <Box className="flex flex-col gap-1 px-2 py-1" sx={{ height: CHART_HEIGHT + 28 }}>
      <Typography variant="caption" color="text.secondary">
        数据曲线（P2 预留 · 按行提取首个数值，共 {series.length} 点
        {series.length > 0 ? ` · 最新 ${series[series.length - 1]}` : ''}）
      </Typography>
      <Box sx={{ height: CHART_HEIGHT, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        {path ? (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path
              d={path}
              fill="none"
              stroke={theme.palette.primary.main}
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <Box className="flex h-full w-full items-center justify-center">
            <Typography variant="caption" color="text.secondary">
              暂无可解析的数值数据（需要接收形如 `12.34` 的文本报文）
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
