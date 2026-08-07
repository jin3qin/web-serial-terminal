/**
 * 接收区容器：ASCII/HEX 切换、编码选择、时间戳开关、自动滚动、清空、导出。
 */

import { useCallback, type MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DownloadIcon from '@mui/icons-material/Download';
import { ENCODING_OPTIONS, type DisplayMode, type TextEncodingName } from '@/types/serial';
import { useMessageStore } from '@/store/useMessageStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { useThrottledMessages } from '@/hooks/useThrottledMessages';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { exportTxt } from '@/utils/exporter';
import { formatConfigSummary } from '@/utils/format';
import MessageList from '@/components/receive/MessageList';
import DataChart from '@/components/receive/DataChart';

/** 接收面板 */
export default function ReceivePanel(): JSX.Element {
  const display = useMessageStore((s) => s.displayOptions);
  const setDisplayOptions = useMessageStore((s) => s.setDisplayOptions);
  const clear = useMessageStore((s) => s.clear);

  const config = useSerialStore((s) => s.config);
  const portLabel = useSerialStore((s) => s.portLabel);
  const resetStats = useSerialStore((s) => s.resetStats);
  const stats = useSerialStore((s) => s.stats);

  const notify = useUiStore((s) => s.notify);
  const chartOpen = useUiStore((s) => s.chartOpen);

  const { persist } = useSerialConnection();
  const messages = useThrottledMessages();

  /** 切换 ASCII / HEX（历史消息同步重渲染，因为存的是 raw 字节） */
  const handleModeChange = useCallback(
    (_e: MouseEvent<HTMLElement>, value: DisplayMode | null): void => {
      if (value === null) {
        return;
      }
      setDisplayOptions({ displayMode: value });
      persist();
    },
    [setDisplayOptions, persist],
  );

  /** 清空消息与统计 */
  const handleClear = useCallback((): void => {
    clear();
    resetStats(stats.connectedAt);
    notify('已清空接收区', 'success', 1500);
  }, [clear, resetStats, stats.connectedAt, notify]);

  /** 导出 txt */
  const handleExport = useCallback((): void => {
    const list = useMessageStore.getState().messages;
    if (list.length === 0) {
      notify('没有可导出的数据', 'info', 2000);
      return;
    }
    const headerNote = `${portLabel || '未连接'} · ${formatConfigSummary(
      config.baudRate,
      config.dataBits,
      config.parity,
      config.stopBits,
    )}`;
    const fileName: string = exportTxt(list, { display, headerNote, withHeader: true });
    notify(`已导出 ${fileName}`, 'success');
  }, [display, portLabel, config, notify]);

  return (
    <Paper
      elevation={0}
      className="flex min-h-0 grow flex-col"
      sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}
    >
      {/* 头部工具条 */}
      <Box
        className="flex flex-wrap items-center gap-2 px-2 py-1"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" className="pr-1">
          接收区
        </Typography>

        <ToggleButtonGroup value={display.displayMode} exclusive onChange={handleModeChange}>
          <ToggleButton value="ascii">ASCII</ToggleButton>
          <ToggleButton value="hex">HEX</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          label="解码"
          value={display.encoding}
          onChange={(e) => {
            setDisplayOptions({ encoding: e.target.value as TextEncodingName });
            persist();
          }}
          disabled={display.displayMode === 'hex'}
          sx={{ width: 110 }}
        >
          {ENCODING_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        <FormControlLabel
          control={
            <Switch
              checked={display.showTimestamp}
              onChange={(e) => {
                setDisplayOptions({ showTimestamp: e.target.checked });
                persist();
              }}
            />
          }
          label={<Typography variant="caption">时间戳</Typography>}
        />

        <Tooltip title="开启后新数据自动滚动到底部；手动上滚时会临时暂停">
          <FormControlLabel
            control={
              <Switch
                checked={display.autoScroll}
                onChange={(e) => {
                  setDisplayOptions({ autoScroll: e.target.checked });
                  persist();
                }}
              />
            }
            label={<Typography variant="caption">自动滚动</Typography>}
          />
        </Tooltip>

        <Box className="grow" />

        <Button startIcon={<DownloadIcon />} onClick={handleExport}>
          导出
        </Button>
        <Button color="warning" startIcon={<DeleteSweepIcon />} onClick={handleClear}>
          清空
        </Button>
      </Box>

      {/* 消息列表 */}
      <MessageList messages={messages} display={display} />

      {/* 数据曲线（P2 预留） */}
      {chartOpen ? (
        <>
          <Divider />
          <DataChart messages={messages} />
        </>
      ) : null}
    </Paper>
  );
}
