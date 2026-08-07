/**
 * 主题切换按钮：明/暗两档，持久化到 localStorage。
 */

import { useCallback } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import { useUiStore } from '@/store/useUiStore';

/** 主题切换按钮 */
export default function ThemeToggle(): JSX.Element {
  const mode = useUiStore((s) => s.themeMode);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const handleClick = useCallback((): void => {
    toggleTheme();
    // 持久化主题偏好
    const newMode = mode === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('spdt:theme', newMode);
    } catch {
      // localStorage 不可用时忽略（隐私模式）
    }
  }, [mode, toggleTheme]);

  return (
    <Tooltip title={mode === 'dark' ? '切换到亮色主题' : '切换到暗色主题'} arrow>
      <IconButton
        onClick={handleClick}
        size="small"
        aria-label="切换主题"
        color="inherit"
      >
        {mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}