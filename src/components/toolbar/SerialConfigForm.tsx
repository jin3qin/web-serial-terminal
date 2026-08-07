/**
 * 串口参数表单：波特率（支持自定义）/数据位/停止位/校验/流控。
 * 连接期间整体禁用（验收点 T03-5）。
 */

import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import {
  BAUD_RATE_OPTIONS,
  DATA_BITS_OPTIONS,
  FLOW_CONTROL_OPTIONS,
  PARITY_OPTIONS,
  STOP_BITS_OPTIONS,
  type FlowControlType,
  type ParityType,
} from '@/types/serial';
import { useSerialStore } from '@/store/useSerialStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';

/** 自定义波特率在下拉中的哨兵值 */
const CUSTOM_BAUD = -1;

/** 串口参数表单 */
export default function SerialConfigForm(): JSX.Element {
  const config = useSerialStore((s) => s.config);
  const setConfig = useSerialStore((s) => s.setConfig);
  const connectionState = useSerialStore((s) => s.connectionState);
  const { persist } = useSerialConnection();

  const disabled: boolean = connectionState !== 'idle' && connectionState !== 'error';

  const isPresetBaud: boolean = useMemo(
    () => BAUD_RATE_OPTIONS.includes(config.baudRate),
    [config.baudRate],
  );
  const [customMode, setCustomMode] = useState<boolean>(!isPresetBaud);
  const [customText, setCustomText] = useState<string>(String(config.baudRate));

  /** 波特率下拉变化 */
  const handleBaudSelect = useCallback(
    (value: string): void => {
      const num: number = Number(value);
      if (num === CUSTOM_BAUD) {
        setCustomMode(true);
        setCustomText(String(config.baudRate));
        return;
      }
      setCustomMode(false);
      setConfig({ baudRate: num });
      persist();
    },
    [config.baudRate, setConfig, persist],
  );

  /** 自定义波特率输入 */
  const handleCustomBaud = useCallback(
    (text: string): void => {
      setCustomText(text);
      const num: number = Number(text);
      if (Number.isFinite(num) && num >= 50 && num <= 4000000) {
        setConfig({ baudRate: Math.floor(num) });
        persist();
      }
    },
    [setConfig, persist],
  );

  const customInvalid: boolean =
    customMode && (!Number.isFinite(Number(customText)) || Number(customText) < 50);

  return (
    <Box className="flex flex-wrap items-start gap-2">
      <Tooltip title="常用值 115200；也可选择「自定义」输入任意波特率">
        <TextField
          select
          label="波特率"
          value={customMode ? String(CUSTOM_BAUD) : String(config.baudRate)}
          onChange={(e) => handleBaudSelect(e.target.value)}
          disabled={disabled}
          sx={{ minWidth: 130 }}
        >
          {BAUD_RATE_OPTIONS.map((b) => (
            <MenuItem key={b} value={String(b)}>
              {b}
            </MenuItem>
          ))}
          <MenuItem value={String(CUSTOM_BAUD)}>自定义…</MenuItem>
        </TextField>
      </Tooltip>

      {customMode ? (
        <TextField
          label="自定义波特率"
          value={customText}
          onChange={(e) => handleCustomBaud(e.target.value)}
          disabled={disabled}
          error={customInvalid}
          helperText={customInvalid ? '请输入 50 - 4000000 之间的整数' : ' '}
          sx={{ width: 150 }}
          inputProps={{ inputMode: 'numeric' }}
        />
      ) : null}

      <TextField
        select
        label="数据位"
        value={String(config.dataBits)}
        onChange={(e) => {
          setConfig({ dataBits: Number(e.target.value) as 7 | 8 });
          persist();
        }}
        disabled={disabled}
        sx={{ minWidth: 96 }}
      >
        {DATA_BITS_OPTIONS.map((d) => (
          <MenuItem key={d} value={String(d)}>
            {d}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="停止位"
        value={String(config.stopBits)}
        onChange={(e) => {
          setConfig({ stopBits: Number(e.target.value) as 1 | 2 });
          persist();
        }}
        disabled={disabled}
        sx={{ minWidth: 96 }}
      >
        {STOP_BITS_OPTIONS.map((s) => (
          <MenuItem key={s} value={String(s)}>
            {s}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="校验位"
        value={config.parity}
        onChange={(e) => {
          setConfig({ parity: e.target.value as ParityType });
          persist();
        }}
        disabled={disabled}
        sx={{ minWidth: 140 }}
      >
        {PARITY_OPTIONS.map((p) => (
          <MenuItem key={p.value} value={p.value}>
            {p.label}
          </MenuItem>
        ))}
      </TextField>

      <Tooltip title="部分 USB-TTL 芯片开启硬件流控会导致打开失败，默认建议「无流控」">
        <TextField
          select
          label="流控"
          value={config.flowControl}
          onChange={(e) => {
            setConfig({ flowControl: e.target.value as FlowControlType });
            persist();
          }}
          disabled={disabled}
          sx={{ minWidth: 170 }}
        >
          {FLOW_CONTROL_OPTIONS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
      </Tooltip>
    </Box>
  );
}
