/**
 * 宏 / 快捷指令面板（P2-1 预留）。
 *
 * MVP 提供最小可用实现：内置若干常用调试指令，单击回填、双击直发。
 * 后续完整版将支持用户自定义宏、持久化与批量时序发送。
 */

import { useCallback } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SendMode } from '@/types/serial';
import { useMessageStore } from '@/store/useMessageStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';

/** 内置宏定义 */
interface MacroItem {
  label: string;
  payload: string;
  mode: SendMode;
  tip: string;
}

const BUILTIN_MACROS: readonly MacroItem[] = [
  { label: 'AT', payload: 'AT', mode: 'text', tip: '模块握手指令' },
  { label: 'AT+GMR', payload: 'AT+GMR', mode: 'text', tip: '查询固件版本' },
  { label: 'AT+RST', payload: 'AT+RST', mode: 'text', tip: '软复位' },
  {
    label: 'Modbus 读保持寄存器',
    payload: '01 03 00 00 00 01',
    mode: 'hex',
    tip: '从站 1，读地址 0 起 1 个寄存器（不含 CRC）',
  },
  {
    label: 'Modbus 读线圈',
    payload: '01 01 00 00 00 08',
    mode: 'hex',
    tip: '从站 1，读地址 0 起 8 个线圈（不含 CRC）',
  },
];

/** 宏面板 */
export default function MacroPanel(): JSX.Element {
  const setDraft = useMessageStore((s) => s.setDraft);
  const setSendOptions = useMessageStore((s) => s.setSendOptions);
  const connectionState = useSerialStore((s) => s.connectionState);
  const macroOpen = useUiStore((s) => s.macroOpen);
  const setMacroOpen = useUiStore((s) => s.setMacroOpen);
  const { send } = useSerialConnection();

  const connected: boolean = connectionState === 'connected';

  /** 单击：切换模式并回填 */
  const handleFill = useCallback(
    (item: MacroItem): void => {
      setSendOptions({ mode: item.mode });
      setDraft(item.payload);
    },
    [setSendOptions, setDraft],
  );

  /** 双击：回填并立即发送 */
  const handleSend = useCallback(
    (item: MacroItem): void => {
      setSendOptions({ mode: item.mode });
      setDraft(item.payload);
      if (connected) {
        void send(item.payload);
      }
    },
    [setSendOptions, setDraft, connected, send],
  );

  return (
    <Box className="flex flex-col">
      <Box className="flex items-center gap-1 px-2 py-1">
        <IconButton onClick={() => setMacroOpen(!macroOpen)}>
          {macroOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="caption" color="text.secondary">
          快捷指令（P2 预留 · 单击回填，双击发送）
        </Typography>
      </Box>

      <Collapse in={macroOpen} unmountOnExit>
        <Box className="flex flex-wrap gap-2 px-3 pb-2">
          {BUILTIN_MACROS.map((item) => (
            <Tooltip key={item.label} title={`${item.tip}（${item.mode === 'hex' ? 'HEX' : '文本'}）`}>
              <Chip
                label={item.label}
                variant="outlined"
                clickable
                onClick={() => handleFill(item)}
                onDoubleClick={() => handleSend(item)}
              />
            </Tooltip>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
