/**
 * Connection toolbar: port selector + connect/disconnect + status indicator + refresh + theme toggle.
 *
 * WebSocket version - ports come from backend enumeration, no popup required.
 */

import { useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import UsbIcon from '@mui/icons-material/Usb';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import TuneIcon from '@mui/icons-material/Tune';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { STATUS_COLORS } from '@/theme/theme';
import type { ConnectionState } from '@/types/serial';
import ThemeToggle from './ThemeToggle';

/** State to indicator lamp color */
function lampColor(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return STATUS_COLORS.connected;
    case 'connecting':
    case 'disconnecting':
    case 'requesting':
      return STATUS_COLORS.busy;
    case 'error':
      return STATUS_COLORS.error;
    default:
      return STATUS_COLORS.idle;
  }
}

/** State to Chinese text */
function stateText(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中…';
    case 'disconnecting':
      return '断开中…';
    case 'requesting':
      return '选择端口…';
    case 'error':
      return '异常';
    case 'unsupported':
      return '不支持';
    default:
      return '未连接';
  }
}

/** Connection toolbar */
export default function ConnectionToolbar(): JSX.Element {
  const connectionState = useSerialStore((s) => s.connectionState);
  const ports = useSerialStore((s) => s.ports);
  const selectedPortId = useSerialStore((s) => s.selectedPortId);
  const selectPort = useSerialStore((s) => s.selectPort);
  const portLabel = useSerialStore((s) => s.portLabel);

  const advancedOpen = useUiStore((s) => s.advancedOpen);
  const setAdvancedOpen = useUiStore((s) => s.setAdvancedOpen);

  const { refreshPorts, connect, disconnect } = useSerialConnection();

  const isConnected: boolean = connectionState === 'connected';
  const isBusy: boolean =
    connectionState === 'connecting' ||
    connectionState === 'disconnecting' ||
    connectionState === 'requesting';

  /** Handle refresh ports */
  const handleRefresh = useCallback((): void => {
    void refreshPorts();
  }, [refreshPorts]);

  /** Handle connect/disconnect toggle */
  const handleToggleConnect = useCallback((): void => {
    if (isConnected) {
      void disconnect();
    } else {
      void connect();
    }
  }, [isConnected, connect, disconnect]);

  return (
    <Box className="flex flex-wrap items-center gap-2">
      <Box className="flex items-center gap-2 pr-2">
        <UsbIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" className="whitespace-nowrap">
          串口调试工具
        </Typography>
      </Box>

      <TextField
        select
        label="端口"
        value={ports.some((p) => p.id === selectedPortId) ? selectedPortId : ''}
        onChange={(e) => selectPort(e.target.value || null)}
        disabled={isConnected || isBusy || ports.length === 0}
        sx={{ minWidth: 240 }}
        helperText={ports.length === 0 ? '点击刷新按钮获取可用端口' : ' '}
      >
        {ports.length === 0 ? (
          <MenuItem value="" disabled>
            无可用端口
          </MenuItem>
        ) : (
          ports.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.label}
            </MenuItem>
          ))
        )}
      </TextField>

      <Tooltip title="刷新端口列表">
        <span>
          <IconButton onClick={handleRefresh} disabled={isConnected || isBusy}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Button
        variant="contained"
        color={isConnected ? 'error' : 'primary'}
        startIcon={
          isBusy ? (
            <CircularProgress size={14} color="inherit" />
          ) : isConnected ? (
            <LinkOffIcon />
          ) : (
            <LinkIcon />
          )
        }
        onClick={handleToggleConnect}
        disabled={isBusy}
      >
        {isConnected ? '断开' : '连接'}
      </Button>

      <Box className="ml-2 flex items-center gap-2">
        <Box
          className={isBusy ? 'spdt-pulse' : ''}
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: lampColor(connectionState),
            boxShadow: `0 0 6px ${lampColor(connectionState)}`,
          }}
        />
        <Typography variant="caption" color="text.secondary" className="whitespace-nowrap">
          {stateText(connectionState)}
          {isConnected && portLabel ? ` · ${portLabel}` : ''}
        </Typography>
      </Box>

      <Box className="grow" />

      <Tooltip title={advancedOpen ? '收起高级设置' : '展开高级设置（RTS/DTR）'}>
        <IconButton onClick={() => setAdvancedOpen(!advancedOpen)} color={advancedOpen ? 'primary' : 'default'}>
          <TuneIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <ThemeToggle />
    </Box>
  );
}