/**
 * 发送区：文本/HEX 模式切换、编码、换行符、多行输入、HEX 实时校验、Ctrl+Enter 快捷发送。
 * 下方集成自动发送、发送历史、宏面板。
 */

import { useCallback, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import SendIcon from '@mui/icons-material/Send';
import ClearIcon from '@mui/icons-material/Clear';
import {
  ENCODING_OPTIONS,
  LINE_ENDING_OPTIONS,
  type LineEnding,
  type SendMode,
  type TextEncodingName,
} from '@/types/serial';
import { useMessageStore } from '@/store/useMessageStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { describeHexError, isValidHex } from '@/utils/hex';
import AutoSendControl from '@/components/send/AutoSendControl';
import SendHistoryList from '@/components/send/SendHistoryList';
import MacroPanel from '@/components/send/MacroPanel';

/** 发送面板 */
export default function SendPanel(): JSX.Element {
  const sendOptions = useMessageStore((s) => s.sendOptions);
  const setSendOptions = useMessageStore((s) => s.setSendOptions);
  const draft = useMessageStore((s) => s.draft);
  const setDraft = useMessageStore((s) => s.setDraft);

  const connectionState = useSerialStore((s) => s.connectionState);
  const { send, persist } = useSerialConnection();

  const connected: boolean = connectionState === 'connected';
  const isHex: boolean = sendOptions.mode === 'hex';

  /** HEX 模式下的校验信息 */
  const hexError: string = useMemo(
    () => (isHex ? describeHexError(draft) : ''),
    [isHex, draft],
  );

  const canSend: boolean =
    connected && draft.length > 0 && (!isHex || isValidHex(draft));

  /** 执行发送 */
  const handleSend = useCallback((): void => {
    if (!canSend) {
      return;
    }
    void send(draft);
  }, [canSend, send, draft]);

  /** Ctrl+Enter 快捷发送 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /** 切换发送模式 */
  const handleModeChange = useCallback(
    (_e: MouseEvent<HTMLElement>, value: SendMode | null): void => {
      if (value === null) {
        return;
      }
      setSendOptions({ mode: value });
      persist();
    },
    [setSendOptions, persist],
  );

  return (
    <Paper
      elevation={0}
      className="flex min-h-0 grow flex-col"
      sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}
    >
      {/* 头部 */}
      <Box
        className="flex flex-wrap items-center gap-2 px-2 py-1"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" className="pr-1">
          发送区
        </Typography>

        <ToggleButtonGroup value={sendOptions.mode} exclusive onChange={handleModeChange}>
          <ToggleButton value="text">文本</ToggleButton>
          <ToggleButton value="hex">HEX</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          label="编码"
          value={sendOptions.encoding}
          onChange={(e) => {
            setSendOptions({ encoding: e.target.value as TextEncodingName });
            persist();
          }}
          disabled={isHex}
          sx={{ width: 104 }}
        >
          {ENCODING_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        <Tooltip title="HEX 模式下不追加换行符">
          <TextField
            select
            label="换行符"
            value={sendOptions.lineEnding}
            onChange={(e) => {
              setSendOptions({ lineEnding: e.target.value as LineEnding });
              persist();
            }}
            disabled={isHex}
            sx={{ width: 118 }}
          >
            {LINE_ENDING_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </Tooltip>
      </Box>

      {/* 输入区 */}
      <Box className="flex flex-col gap-2 p-2">
        <TextField
          className="spdt-input-mono"
          multiline
          minRows={4}
          maxRows={8}
          fullWidth
          placeholder={
            isHex ? '输入 HEX，例如：01 03 00 00 00 01 或 0xAA,0xBB' : '输入要发送的文本内容…'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          error={isHex && hexError.length > 0}
          helperText={
            isHex && hexError.length > 0
              ? hexError
              : 'Ctrl + Enter 快捷发送'
          }
        />

        <Box className="flex items-center gap-2">
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            onClick={handleSend}
            disabled={!canSend}
          >
            发送
          </Button>
          <Button startIcon={<ClearIcon />} onClick={() => setDraft('')} disabled={draft.length === 0}>
            清空输入
          </Button>
          <Box className="grow" />
          <Typography variant="caption" color="text.secondary">
            {connected ? `${draft.length} 字符` : '未连接'}
          </Typography>
        </Box>
      </Box>

      <Divider />
      <AutoSendControl />
      <Divider />

      {/* 历史与宏（可滚动区） */}
      <Box className="min-h-0 grow overflow-auto">
        <SendHistoryList />
        <Divider />
        <MacroPanel />
      </Box>
    </Paper>
  );
}
