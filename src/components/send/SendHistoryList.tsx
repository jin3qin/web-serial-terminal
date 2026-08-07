/**
 * 发送历史：最近 50 条，单击回填、双击直发、可删除、可清空，随配置持久化。
 */

import { useCallback } from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMessageStore } from '@/store/useMessageStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';

/** 发送历史列表 */
export default function SendHistoryList(): JSX.Element {
  const history = useMessageStore((s) => s.history);
  const setDraft = useMessageStore((s) => s.setDraft);
  const removeHistory = useMessageStore((s) => s.removeHistory);
  const clearHistory = useMessageStore((s) => s.clearHistory);

  const connectionState = useSerialStore((s) => s.connectionState);
  const historyOpen = useUiStore((s) => s.historyOpen);
  const setHistoryOpen = useUiStore((s) => s.setHistoryOpen);
  const { send, persist } = useSerialConnection();

  const connected: boolean = connectionState === 'connected';

  /** 单击回填到输入框 */
  const handleFill = useCallback(
    (text: string): void => {
      setDraft(text);
    },
    [setDraft],
  );

  /** 双击直接发送 */
  const handleDirectSend = useCallback(
    (text: string): void => {
      setDraft(text);
      if (connected) {
        void send(text);
      }
    },
    [setDraft, connected, send],
  );

  /** 删除一条 */
  const handleRemove = useCallback(
    (text: string): void => {
      removeHistory(text);
      persist();
    },
    [removeHistory, persist],
  );

  /** 清空全部 */
  const handleClearAll = useCallback((): void => {
    clearHistory();
    persist();
  }, [clearHistory, persist]);

  return (
    <Box className="flex flex-col">
      <Box className="flex items-center gap-1 px-2 py-1">
        <IconButton onClick={() => setHistoryOpen(!historyOpen)}>
          {historyOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="caption" color="text.secondary">
          发送历史（{history.length}）· 单击回填，双击直接发送
        </Typography>
        <Box className="grow" />
        <Button size="small" onClick={handleClearAll} disabled={history.length === 0}>
          清空
        </Button>
      </Box>

      <Collapse in={historyOpen} unmountOnExit>
        {history.length === 0 ? (
          <Typography variant="caption" color="text.secondary" className="block px-4 pb-2">
            暂无历史记录
          </Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto' }}>
            {history.map((text) => (
              <ListItem
                key={text}
                disablePadding
                secondaryAction={
                  <Tooltip title="删除这条历史">
                    <IconButton edge="end" onClick={() => handleRemove(text)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemButton
                  onClick={() => handleFill(text)}
                  onDoubleClick={() => handleDirectSend(text)}
                  dense
                >
                  <ListItemText
                    primary={text}
                    primaryTypographyProps={{
                      noWrap: true,
                      className: 'spdt-mono',
                      sx: { fontSize: 12 },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Collapse>
    </Box>
  );
}
