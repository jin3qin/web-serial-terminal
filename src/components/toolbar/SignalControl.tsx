/**
 * 控制线面板（高级折叠区）：
 * - 可写：DTR / RTS（一键复位 ESP32/STM32 常用）；
 * - 只读：CTS / DSR / DCD / RI，连接期间每秒轮询一次。
 */

import { useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useSerialStore } from '@/store/useSerialStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';

/** 输入信号线展示项 */
interface SignalChipProps {
  label: string;
  active: boolean;
}

/** 只读信号灯 */
function SignalChip({ label, active }: SignalChipProps): JSX.Element {
  return (
    <Chip
      label={label}
      color={active ? 'success' : 'default'}
      variant={active ? 'filled' : 'outlined'}
      size="small"
    />
  );
}

/** 控制线面板 */
export default function SignalControl(): JSX.Element {
  const connectionState = useSerialStore((s) => s.connectionState);
  const outputSignals = useSerialStore((s) => s.outputSignals);
  const inputSignals = useSerialStore((s) => s.inputSignals);
  const { setSignals, pollInputSignals } = useSerialConnection();

  const connected: boolean = connectionState === 'connected';

  // 连接期间轮询输入信号线
  useEffect(() => {
    if (!connected) {
      return;
    }
    void pollInputSignals();
    const timer: number = window.setInterval(() => {
      void pollInputSignals();
    }, 1000);
    return (): void => {
      window.clearInterval(timer);
    };
  }, [connected, pollInputSignals]);

  /** 切换 DTR */
  const handleDtr = useCallback(
    (checked: boolean): void => {
      void setSignals({ dataTerminalReady: checked });
    },
    [setSignals],
  );

  /** 切换 RTS */
  const handleRts = useCallback(
    (checked: boolean): void => {
      void setSignals({ requestToSend: checked });
    },
    [setSignals],
  );

  /**
   * 一键复位时序：DTR=false + RTS=true → 延时 → RTS=false。
   * 适用于常见 STM32 / ESP32 开发板的复位电路。
   */
  const handleReset = useCallback((): void => {
    void (async (): Promise<void> => {
      await setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      await setSignals({ dataTerminalReady: false, requestToSend: false });
    })();
  }, [setSignals]);

  return (
    <Box className="flex flex-wrap items-center gap-4">
      <Typography variant="caption" color="text.secondary">
        输出控制线
      </Typography>

      <Tooltip title="Data Terminal Ready">
        <FormControlLabel
          control={
            <Switch
              checked={outputSignals.dataTerminalReady}
              onChange={(e) => handleDtr(e.target.checked)}
              disabled={!connected}
            />
          }
          label="DTR"
        />
      </Tooltip>

      <Tooltip title="Request To Send">
        <FormControlLabel
          control={
            <Switch
              checked={outputSignals.requestToSend}
              onChange={(e) => handleRts(e.target.checked)}
              disabled={!connected}
            />
          }
          label="RTS"
        />
      </Tooltip>

      <Button
        variant="outlined"
        startIcon={<RestartAltIcon />}
        onClick={handleReset}
        disabled={!connected}
      >
        一键复位
      </Button>

      <Divider orientation="vertical" flexItem />

      <Typography variant="caption" color="text.secondary">
        输入信号线（只读）
      </Typography>
      <Box className="flex flex-wrap items-center gap-2">
        <SignalChip label="CTS" active={inputSignals.clearToSend} />
        <SignalChip label="DSR" active={inputSignals.dataSetReady} />
        <SignalChip label="DCD" active={inputSignals.dataCarrierDetect} />
        <SignalChip label="RI" active={inputSignals.ringIndicator} />
      </Box>
    </Box>
  );
}
