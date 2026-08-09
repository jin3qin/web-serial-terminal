/**
 * 可自定义发送快捷键面板（支持分组）。
 *
 * 功能：
 * - 支持分组管理（创建、编辑、删除分组）
 * - 快捷指令可关联到分组
 * - 分组可折叠/展开
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
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import UploadIcon from '@mui/icons-material/Upload';
import DownloadIcon from '@mui/icons-material/Download';
import {
  MAX_GROUPS,
  MAX_MACROS,
  type MacroGroup,
  type MacroShortcut,
  type MacroStorage,
  type SendMode,
} from '@/types/serial';
import { useMessageStore } from '@/store/useMessageStore';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { loadMacroStorage, saveMacroStorage } from '@/utils/storage';
import { exportMacroConfig, importMacroConfig, type ImportResult } from '@/utils/macroExporter';

/** 宏面板 */
export default function MacroPanel(): JSX.Element {
  const [storage, setStorage] = useState<MacroStorage>(() => loadMacroStorage());
  const [editMacroDialogOpen, setEditMacroDialogOpen] = useState(false);
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<MacroShortcut | null>(null);
  const [editingGroup, setEditingGroup] = useState<MacroGroup | null>(null);
  const [editMacroForm, setEditMacroForm] = useState({
    label: '',
    payload: '',
    mode: 'text' as SendMode,
    description: '',
    groupId: '' as string,
  });
  const [editGroupForm, setEditGroupForm] = useState({
    name: '',
    description: '',
  });
  const [locked, setLocked] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // 默认展开所有分组
    return new Set(storage.groups.map(g => g.id));
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const setDraft = useMessageStore((s) => s.setDraft);
  const setSendOptions = useMessageStore((s) => s.setSendOptions);
  const connectionState = useSerialStore((s) => s.connectionState);
  const macroOpen = useUiStore((s) => s.macroOpen);
  const setMacroOpen = useUiStore((s) => s.setMacroOpen);
  const { send, persist } = useSerialConnection();

  const connected: boolean = connectionState === 'connected';

  /** 保存宏存储数据到 localStorage */
  const saveMacroData = useCallback(
    (data: MacroStorage): void => {
      setStorage(data);
      saveMacroStorage(data);
      persist();
    },
    [persist],
  );

  /** 切换分组折叠状态 */
  const toggleGroupExpand = useCallback((groupId: string): void => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  /** 单击：已连接则发送，未连接则回填 */
  const handleMacroClick = useCallback(
    (item: MacroShortcut): void => {
      setSendOptions({ mode: item.mode });
      setDraft(item.payload);
      if (connected) {
        void send(item.payload);
      }
    },
    [setSendOptions, setDraft, connected, send],
  );

  /** 打开编辑快捷指令对话框 */
  const handleOpenEditMacro = useCallback(
    (macro?: MacroShortcut, defaultGroupId?: string): void => {
      if (macro) {
        setEditingMacro(macro);
        setEditMacroForm({
          label: macro.label,
          payload: macro.payload,
          mode: macro.mode,
          description: macro.description,
          groupId: macro.groupId || '',
        });
      } else {
        setEditingMacro(null);
        setEditMacroForm({
          label: '',
          payload: '',
          mode: 'text',
          description: '',
          groupId: defaultGroupId || '',
        });
      }
      setEditMacroDialogOpen(true);
    },
    [],
  );

  /** 保存快捷指令编辑 */
  const handleSaveEditMacro = useCallback((): void => {
    if (!editMacroForm.label.trim() || !editMacroForm.payload.trim()) {
      return;
    }

    const newMacro: MacroShortcut = {
      id: editingMacro?.id || `macro-${Date.now()}`,
      label: editMacroForm.label.trim(),
      payload: editMacroForm.payload.trim(),
      mode: editMacroForm.mode,
      description: editMacroForm.description.trim(),
      groupId: editMacroForm.groupId || undefined,
    };

    let newMacros: MacroShortcut[];
    if (editingMacro) {
      // 编辑现有宏
      newMacros = storage.macros.map((m) => (m.id === editingMacro.id ? newMacro : m));
    } else {
      // 新增宏
      if (storage.macros.length >= MAX_MACROS) {
        return;
      }
      newMacros = [...storage.macros, newMacro];
    }

    saveMacroData({ ...storage, macros: newMacros });
    setEditMacroDialogOpen(false);
  }, [editMacroForm, editingMacro, storage, saveMacroData]);

  /** 删除快捷指令 */
  const handleDeleteMacro = useCallback(
    (id: string): void => {
      const newMacros = storage.macros.filter((m) => m.id !== id);
      saveMacroData({ ...storage, macros: newMacros });
    },
    [storage, saveMacroData],
  );

  /** 打开编辑分组对话框 */
  const handleOpenEditGroup = useCallback(
    (group?: MacroGroup): void => {
      if (group) {
        setEditingGroup(group);
        setEditGroupForm({
          name: group.name,
          description: group.description || '',
        });
      } else {
        setEditingGroup(null);
        setEditGroupForm({ name: '', description: '' });
      }
      setEditGroupDialogOpen(true);
    },
    [],
  );

  /** 保存分组编辑 */
  const handleSaveEditGroup = useCallback((): void => {
    if (!editGroupForm.name.trim()) {
      return;
    }

    const newGroup: MacroGroup = {
      id: editingGroup?.id || `group-${Date.now()}`,
      name: editGroupForm.name.trim(),
      description: editGroupForm.description.trim() || undefined,
      order: editingGroup?.order ?? storage.groups.length,
    };

    let newGroups: MacroGroup[];
    if (editingGroup) {
      // 编辑现有分组
      newGroups = storage.groups.map((g) => (g.id === editingGroup.id ? newGroup : g));
    } else {
      // 新增分组
      if (storage.groups.length >= MAX_GROUPS) {
        return;
      }
      newGroups = [...storage.groups, newGroup];
    }

    saveMacroData({ ...storage, groups: newGroups });
    setEditGroupDialogOpen(false);
  }, [editGroupForm, editingGroup, storage, saveMacroData]);

  /** 删除分组 */
  const handleDeleteGroup = useCallback(
    (groupId: string): void => {
      const newGroups = storage.groups.filter((g) => g.id !== groupId);
      // 将该分组下的快捷指令设置为未分组
      const newMacros = storage.macros.map((m) =>
        m.groupId === groupId ? { ...m, groupId: undefined } : m,
      );
      saveMacroData({ ...storage, groups: newGroups, macros: newMacros });
      // 从展开列表中移除
      setExpandedGroups(prev => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    },
    [storage, saveMacroData],
  );

  /** 导出配置 */
  const handleExport = useCallback((): void => {
    exportMacroConfig(storage);
    useUiStore.getState().notify('配置已导出', 'success', 2500);
  }, [storage]);

  /** 打开文件选择器导入配置 */
  const handleImportClick = useCallback((): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const result = await importMacroConfig(file);
        setImportResult(result);
        setImportDialogOpen(true);
      }
    };
    input.click();
  }, []);

  /** 确认导入 */
  const handleConfirmImport = useCallback((): void => {
    if (importResult?.success && importResult.data) {
      saveMacroData(importResult.data);
      useUiStore.getState().notify(
        `成功导入 ${importResult.stats?.groups} 个分组、${importResult.stats?.macros} 个快捷指令`,
        'success',
        3000
      );
    }
    setImportDialogOpen(false);
    setImportResult(null);
  }, [importResult, saveMacroData]);

  /** 生成 Tooltip 内容 */
  const getTooltipContent = useCallback(
    (item: MacroShortcut): string => {
      const modeLabel = item.mode === 'hex' ? 'HEX' : '文本';
      const group = storage.groups.find(g => g.id === item.groupId);
      const groupLabel = group ? `分组：${group.name}\n` : '';
      return `${groupLabel}${item.description}\n发送内容（${modeLabel}）：${item.payload}`;
    },
    [storage.groups],
  );

  /** 获取分组下的快捷指令 */
  const getMacrosByGroup = useCallback(
    (groupId?: string): MacroShortcut[] => {
      return storage.macros.filter((m) =>
        groupId === undefined ? !m.groupId : m.groupId === groupId,
      );
    },
    [storage.macros],
  );

  /** 获取未分组的快捷指令 */
  const ungroupedMacros = getMacrosByGroup(undefined);

  return (
    <Box className="flex flex-col">
      {/* 标题栏 */}
      <Box className="flex items-center gap-1 px-2 py-1">
        <IconButton onClick={() => setMacroOpen(!macroOpen)}>
          {macroOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="caption" color="text.secondary">
          快捷指令（{storage.macros.length}/{MAX_MACROS}）· {connected ? '单击发送' : '单击回填'}
        </Typography>
        <Box className="grow" />
        <IconButton
          size="small"
          onClick={() => setLocked(!locked)}
          title={locked ? '解锁编辑' : '锁定编辑'}
        >
          {locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
        </IconButton>
        {!locked && (
          <>
            <IconButton
              size="small"
              onClick={handleImportClick}
              title="导入配置"
            >
              <UploadIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleExport}
              title="导出配置"
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleOpenEditGroup()}
              disabled={storage.groups.length >= MAX_GROUPS}
              title="添加分组"
            >
              <FolderIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleOpenEditMacro()}
              disabled={storage.macros.length >= MAX_MACROS}
              title="添加快捷指令"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </Box>

      {/* 快捷指令列表 */}
      <Collapse in={macroOpen} unmountOnExit>
        {storage.groups.length === 0 && storage.macros.length === 0 ? (
          <Typography variant="caption" color="text.secondary" className="block px-4 pb-2">
            暂无快捷指令，点击 + 添加
          </Typography>
        ) : (
          <Box className="pb-2">
            {/* 渲染分组 */}
            {storage.groups
              .sort((a, b) => a.order - b.order)
              .map((group) => {
                const groupMacros = getMacrosByGroup(group.id);
                const isExpanded = expandedGroups.has(group.id);

                return (
                  <Box key={group.id} className="mb-1">
                    {/* 分组标题 */}
                    <Box
                      className="flex items-center gap-1 px-3 py-1 cursor-pointer hover:bg-opacity-10"
                      sx={{
                        bgcolor: 'action.hover',
                        borderBottom: 1,
                        borderColor: 'divider',
                      }}
                      onClick={() => toggleGroupExpand(group.id)}
                    >
                      <IconButton size="small" onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupExpand(group.id);
                      }}>
                        {isExpanded ? <FolderOpenIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
                      </IconButton>
                      <Typography variant="caption" fontWeight="medium">
                        {group.name} ({groupMacros.length})
                      </Typography>
                      {!locked && (
                        <Box className="flex gap-1 ml-auto">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditMacro(undefined, group.id);
                            }}
                            disabled={storage.macros.length >= MAX_MACROS}
                            sx={{ padding: '2px' }}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditGroup(group);
                            }}
                            sx={{ padding: '2px' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(group.id);
                            }}
                            sx={{ padding: '2px' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      )}
                    </Box>

                    {/* 分组内容 */}
                    <Collapse in={isExpanded} unmountOnExit>
                      {groupMacros.length === 0 ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          className="block px-4 py-2"
                        >
                          暂无快捷指令
                        </Typography>
                      ) : (
                        <Box className="flex flex-wrap gap-2 px-3 py-2">
                          {groupMacros.map((item) => (
                            <Box key={item.id} className="flex items-center gap-1">
                              <Tooltip
                                title={
                                  <Typography variant="caption" style={{ whiteSpace: 'pre-line' }}>
                                    {getTooltipContent(item)}
                                  </Typography>
                                }
                                arrow
                                placement="top"
                              >
                                <Chip
                                  label={item.label}
                                  variant="outlined"
                                  clickable
                                  onClick={() => handleMacroClick(item)}
                                />
                              </Tooltip>
                              {!locked && (
                                <>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenEditMacro(item)}
                                    sx={{ padding: '2px' }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteMacro(item.id)}
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
                  </Box>
                );
              })}

            {/* 未分组的快捷指令 */}
            {ungroupedMacros.length > 0 && (
              <Box className="mb-1">
                <Box
                  className="flex items-center gap-1 px-3 py-1 cursor-pointer"
                  sx={{
                    bgcolor: 'action.hover',
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                  onClick={() => toggleGroupExpand('ungrouped')}
                >
                  <IconButton size="small">
                    {expandedGroups.has('ungrouped') ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </IconButton>
                  <Typography variant="caption" fontWeight="medium">
                    未分组 ({ungroupedMacros.length})
                  </Typography>
                </Box>
                <Collapse
                  in={expandedGroups.has('ungrouped')}
                  unmountOnExit
                >
                  <Box className="flex flex-wrap gap-2 px-3 py-2">
                    {ungroupedMacros.map((item) => (
                      <Box key={item.id} className="flex items-center gap-1">
                        <Tooltip
                          title={
                            <Typography variant="caption" style={{ whiteSpace: 'pre-line' }}>
                              {getTooltipContent(item)}
                            </Typography>
                          }
                          arrow
                          placement="top"
                        >
                          <Chip
                            label={item.label}
                            variant="outlined"
                            clickable
                            onClick={() => handleMacroClick(item)}
                          />
                        </Tooltip>
                        {!locked && (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEditMacro(item)}
                              sx={{ padding: '2px' }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteMacro(item.id)}
                              sx={{ padding: '2px' }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            )}
          </Box>
        )}
      </Collapse>

      {/* 编辑快捷指令对话框 */}
      <Dialog
        open={editMacroDialogOpen}
        onClose={() => setEditMacroDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingMacro ? '编辑快捷指令' : '添加快捷指令'}</DialogTitle>
        <DialogContent>
          <Box className="flex flex-col gap-3 pt-2">
            <TextField
              label="按键名称"
              value={editMacroForm.label}
              onChange={(e) => setEditMacroForm({ ...editMacroForm, label: e.target.value })}
              fullWidth
              placeholder="例如：AT 测试"
            />

            <FormControl fullWidth>
              <InputLabel>所属分组</InputLabel>
              <Select
                value={editMacroForm.groupId}
                onChange={(e) =>
                  setEditMacroForm({ ...editMacroForm, groupId: e.target.value })
                }
                label="所属分组"
              >
                <MenuItem value="">
                  <em>未分组</em>
                </MenuItem>
                {storage.groups.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl component="fieldset">
              <Typography variant="caption" color="text.secondary" className="mb-1">
                发送模式
              </Typography>
              <RadioGroup
                row
                value={editMacroForm.mode}
                onChange={(e) =>
                  setEditMacroForm({ ...editMacroForm, mode: e.target.value as SendMode })
                }
              >
                <FormControlLabel value="text" control={<Radio size="small" />} label="文本" />
                <FormControlLabel value="hex" control={<Radio size="small" />} label="HEX" />
              </RadioGroup>
            </FormControl>

            <TextField
              label="发送内容"
              value={editMacroForm.payload}
              onChange={(e) => setEditMacroForm({ ...editMacroForm, payload: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              placeholder={editMacroForm.mode === 'hex' ? '例如：01 03 00 00 00 01' : '例如：AT+GMR'}
            />

            <TextField
              label="描述（可选）"
              value={editMacroForm.description}
              onChange={(e) =>
                setEditMacroForm({ ...editMacroForm, description: e.target.value })
              }
              fullWidth
              placeholder="鼠标悬停时显示的提示文字"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditMacroDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleSaveEditMacro}
            variant="contained"
            disabled={!editMacroForm.label.trim() || !editMacroForm.payload.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑分组对话框 */}
      <Dialog
        open={editGroupDialogOpen}
        onClose={() => setEditGroupDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingGroup ? '编辑分组' : '添加分组'}</DialogTitle>
        <DialogContent>
          <Box className="flex flex-col gap-3 pt-2">
            <TextField
              label="分组名称"
              value={editGroupForm.name}
              onChange={(e) => setEditGroupForm({ ...editGroupForm, name: e.target.value })}
              fullWidth
              placeholder="例如：AT 指令"
            />

            <TextField
              label="描述（可选）"
              value={editGroupForm.description}
              onChange={(e) =>
                setEditGroupForm({ ...editGroupForm, description: e.target.value })
              }
              fullWidth
              placeholder="分组的简要描述"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditGroupDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleSaveEditGroup}
            variant="contained"
            disabled={!editGroupForm.name.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 导入确认对话框 */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>导入快捷指令配置</DialogTitle>
        <DialogContent>
          {importResult?.success ? (
            <Box>
              <Typography gutterBottom>配置文件包含：</Typography>
              <Typography>• {importResult.stats?.groups} 个分组</Typography>
              <Typography>• {importResult.stats?.macros} 个快捷指令</Typography>
              <Typography color="warning.main" sx={{ mt: 2 }}>
                ⚠️ 导入将替换当前所有快捷指令配置
              </Typography>
            </Box>
          ) : (
            <Typography color="error">{importResult?.error}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>取消</Button>
          {importResult?.success && (
            <Button onClick={handleConfirmImport} variant="contained">
              确认导入
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}