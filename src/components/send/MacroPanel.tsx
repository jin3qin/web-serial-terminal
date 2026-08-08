/**
 * 可自定义发送快捷键面板。
 *
 * 功能：
 * - 可编辑按键名称、发送内容（hex/ascii）
 * - 鼠标悬停显示发送的具体内容
 * - 单击回填，双击发送
 * - 支持添加、编辑、删除、排序
 */

import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { MAX_MACROS, type MacroShortcut, type SendMode } from '@/types/serial';
import { useMessageStore } from '@/store/useMessageStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { loadMacros, saveMacros } from '@/utils/storage';

/** 宏面板 */
export default function MacroPanel(): JSX.Element {
  const [macros, setMacros] = useState<MacroShortcut[]>(() => loadMacros());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<MacroShortcut | null>(null);
  const [editForm, setEditForm] = useState({
    label: '',
    payload: '',
    mode: 'text' as SendMode,
    description: '',
  });
  const [locked, setLocked] = useState(true);

  const setDraft = useMessageStore((s) => s.setDraft);
  const setSendOptions = useMessageStore((s) => s.setSendOptions);
  const connectionState = useSerialStore((s) => s.connectionState);
  const macroOpen = useUiStore((s) => s.macroOpen);
  const setMacroOpen = useUiStore((s) => s.setMacroOpen);
  const { send, persist } = useSerialConnection();

  const connected: boolean = connectionState === 'connected';

  /** 保存宏列表到 localStorage */
  const saveMacroList = useCallback(
    (list: MacroShortcut[]): void => {
      setMacros(list);
      saveMacros(list);
      persist();
    },
    [persist],
  );

  /** 单击：已连接则发送，未连接则回填 */
  const handleClick = useCallback(
    (item: MacroShortcut): void => {
      setSendOptions({ mode: item.mode });
      setDraft(item.payload);
      if (connected) {
        void send(item.payload);
      }
    },
    [setSendOptions, setDraft, connected, send],
  );

  /** 打开编辑对话框（新增或编辑） */
  const handleOpenEdit = useCallback(
    (macro?: MacroShortcut): void => {
      if (macro) {
        setEditingMacro(macro);
        setEditForm({
          label: macro.label,
          payload: macro.payload,
          mode: macro.mode,
          description: macro.description,
        });
      } else {
        setEditingMacro(null);
        setEditForm({ label: '', payload: '', mode: 'text', description: '' });
      }
      setEditDialogOpen(true);
    },
    [],
  );

  /** 保存编辑 */
  const handleSaveEdit = useCallback((): void => {
    if (!editForm.label.trim() || !editForm.payload.trim()) {
      return;
    }

    const newMacro: MacroShortcut = {
      id: editingMacro?.id || `macro-${Date.now()}`,
      label: editForm.label.trim(),
      payload: editForm.payload.trim(),
      mode: editForm.mode,
      description: editForm.description.trim(),
    };

    let newList: MacroShortcut[];
    if (editingMacro) {
      // 编辑现有宏
      newList = macros.map((m) => (m.id === editingMacro.id ? newMacro : m));
    } else {
      // 新增宏
      if (macros.length >= MAX_MACROS) {
        return;
      }
      newList = [...macros, newMacro];
    }

    saveMacroList(newList);
    setEditDialogOpen(false);
  }, [editForm, editingMacro, macros, saveMacroList]);

  /** 删除宏 */
  const handleDelete = useCallback(
    (id: string): void => {
      const newList = macros.filter((m) => m.id !== id);
      saveMacroList(newList);
    },
    [macros, saveMacroList],
  );

  /** 生成 Tooltip 内容 */
  const getTooltipContent = useCallback(
    (item: MacroShortcut): string => {
      const modeLabel = item.mode === 'hex' ? 'HEX' : '文本';
      return `${item.description}\n发送内容（${modeLabel}）：${item.payload}`;
    },
    [],
  );

  return (
    <Box className="flex flex-col">
      <Box className="flex items-center gap-1 px-2 py-1">
        <IconButton onClick={() => setMacroOpen(!macroOpen)}>
          {macroOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="caption" color="text.secondary">
          快捷指令（{macros.length}/{MAX_MACROS}）· {connected ? '单击发送' : '单击回填'}
        </Typography>
        <Box className="grow" />
        <IconButton
          size="small"
          onClick={() => setLocked(!locked)}
          title={locked ? '解锁编辑' : '锁定编辑'}
        >
          {locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleOpenEdit()}
          disabled={macros.length >= MAX_MACROS || locked}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      <Collapse in={macroOpen} unmountOnExit>
        {macros.length === 0 ? (
          <Typography variant="caption" color="text.secondary" className="block px-4 pb-2">
            暂无快捷指令，点击 + 添加
          </Typography>
        ) : (
          <Box className="flex flex-wrap gap-2 px-3 pb-2">
            {macros.map((item) => (
              <Box key={item.id} className="flex items-center gap-1">
                <Tooltip
                  title={<Typography variant="caption" style={{ whiteSpace: 'pre-line' }}>{getTooltipContent(item)}</Typography>}
                  arrow
                  placement="top"
                >
                  <Chip
                    label={item.label}
                    variant="outlined"
                    clickable
                    onClick={() => handleClick(item)}
                  />
                </Tooltip>
                {!locked && (
                  <>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenEdit(item)}
                      sx={{ padding: '2px' }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(item.id)}
                      sx={{ padding: '2px' }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Collapse>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingMacro ? '编辑快捷指令' : '添加快捷指令'}</DialogTitle>
        <DialogContent>
          <Box className="flex flex-col gap-3 pt-2">
            <TextField
              label="按键名称"
              value={editForm.label}
              onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
              fullWidth
              placeholder="例如：AT 测试"
            />

            <FormControl component="fieldset">
              <Typography variant="caption" color="text.secondary" className="mb-1">
                发送模式
              </Typography>
              <RadioGroup
                row
                value={editForm.mode}
                onChange={(e) => setEditForm({ ...editForm, mode: e.target.value as SendMode })}
              >
                <FormControlLabel value="text" control={<Radio size="small" />} label="文本" />
                <FormControlLabel value="hex" control={<Radio size="small" />} label="HEX" />
              </RadioGroup>
            </FormControl>

            <TextField
              label="发送内容"
              value={editForm.payload}
              onChange={(e) => setEditForm({ ...editForm, payload: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              placeholder={editForm.mode === 'hex' ? '例如：01 03 00 00 00 01' : '例如：AT+GMR'}
            />

            <TextField
              label="描述（可选）"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
              placeholder="鼠标悬停时显示的提示文字"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={!editForm.label.trim() || !editForm.payload.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}