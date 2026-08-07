/**
 * 自动发送控制：开关、间隔、重复模式、次数、已发计数。
 * 断开连接时开关自动复位（由 useAutoSend 保证）。
 */

import { useCallback } from 'react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { PERF, type RepeatMode } from '@/types/serial';
import { useUiStore } from '@/store/useUiStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useAutoSend } from '@/hooks/useAutoSend';
import { useSerialConnection } from '@/hooks/useSerialConnection';

/** 自动发送控制条 */
export default function AutoSendControl(): JSX.Element {
  const autoSend = useUiStore((s) => s.autoSend);
  const setAutoSend = useUiStore((s) => s.setAutoSend);
  const connectionState = useSerialStore((s) => s.connectionState);
  const { persist } = useSerialConnection();

  // 挂载自动发送引擎（内部按 enabled 驱动定时器）
  const { start, stop, running } = useAutoSend();

  const connected: boolean = connectionState === 'connected';

  /** 开关切换 */
  const handleToggle = useCallback(
    (checked: boolean): void => {
      if (checked) {
        start();
      } else {
        stop();
      }
    },
    [start, stop],
  );

  /** 间隔变更（下限 20ms） */
  const handleInterval = useCallback(
    (text: string): void => {
      const num: number = Number(text);
      if (Number.isFinite(num)) {
        setAutoSend({ intervalMs: Math.max(PERF.MIN_AUTO_SEND_INTERVAL_MS, Math.floor(num)) });
        persist();
      }
    },
    [setAutoSend, persist],
  );

  return (
    <Box className="flex flex-wrap items-center gap-2 px-2 py-1">
      <Tooltip title="按固定间隔重复发送当前输入内容">
        <FormControlLabel
          control={
            <Switch
              checked={autoSend.enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              disabled={!connected}
            />
          }
          label={<Typography variant="caption">自动发送</Typography>}
        />
      </Tooltip>

      <TextField
        label="间隔(ms)"
        value={String(autoSend.intervalMs)}
        onChange={(e) => handleInterval(e.target.value)}
        disabled={autoSend.enabled}
        sx={{ width: 108 }}
        inputProps={{ inputMode: 'numeric' }}
      />

      <TextField
        select
        label="模式"
        value={autoSend.repeatMode}
        onChange={(e) => {
          setAutoSend({ repeatMode: e.target.value as RepeatMode });
          persist();
        }}
        disabled={autoSend.enabled}
        sx={{ width: 106 }}
      >
        <MenuItem value="infinite">无限</MenuItem>
        <MenuItem value="count">指定次数</MenuItem>
      </TextField>

      {autoSend.repeatMode === 'count' ? (
        <TextField
          label="次数"
          value={String(autoSend.maxCount)}
          onChange={(e) => {
            const num: number = Number(e.target.value);
            if (Number.isFinite(num) && num >= 1) {
              setAutoSend({ maxCount: Math.floor(num) });
              persist();
            }
          }}
          disabled={autoSend.enabled}
          sx={{ width: 90 }}
          inputProps={{ inputMode: 'numeric' }}
        />
      ) : null}

      <Box className="grow" />

      <Chip
        label={`已发 ${autoSend.sentCount}`}
        color={running ? 'primary' : 'default'}
        variant={running ? 'filled' : 'outlined'}
      />
    </Box>
  );
}
