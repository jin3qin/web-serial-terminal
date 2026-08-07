/**
 * MUI 明暗双主题。调试工具专用配色（终端绿 / 告警红）+ 紧凑密度。
 * 样式分工（§8.7）：MUI 负责组件视觉，Tailwind 只负责布局。
 */

import { createTheme, type Theme } from '@mui/material/styles';
import type { ThemeMode } from '@/types/serial';

/** 数据区统一等宽字体栈 */
export const MONO_FONT_STACK: string =
  "ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace";

/** 收发消息着色（明暗各一套，§8.7） */
export interface DirectionPalette {
  tx: string;
  rx: string;
  system: string;
  systemWarning: string;
  systemError: string;
}

export const DIRECTION_COLORS: Record<ThemeMode, DirectionPalette> = {
  dark: {
    tx: '#64b5f6',
    rx: '#66bb6a',
    system: '#9e9e9e',
    systemWarning: '#ffb74d',
    systemError: '#ef5350',
  },
  light: {
    tx: '#1565c0',
    rx: '#2e7d32',
    system: '#757575',
    systemWarning: '#ed6c02',
    systemError: '#c62828',
  },
};

/** 连接状态指示灯配色 */
export const STATUS_COLORS = {
  idle: '#9e9e9e',
  busy: '#ffa726',
  connected: '#4caf50',
  error: '#f44336',
} as const;

/**
 * 创建主题。
 *
 * @param mode 明暗模式
 * @returns MUI Theme
 */
export function createAppTheme(mode: ThemeMode): Theme {
  const isDark: boolean = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: { main: isDark ? '#42a5f5' : '#1976d2' },
      secondary: { main: isDark ? '#66bb6a' : '#2e7d32' },
      error: { main: isDark ? '#ef5350' : '#d32f2f' },
      warning: { main: isDark ? '#ffa726' : '#ed6c02' },
      success: { main: isDark ? '#66bb6a' : '#2e7d32' },
      background: {
        default: isDark ? '#0f1419' : '#f5f6f8',
        paper: isDark ? '#171c23' : '#ffffff',
      },
      divider: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
    },
    typography: {
      fontFamily:
        "'Segoe UI', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 600 },
      caption: { fontSize: 11 },
    },
    shape: { borderRadius: 6 },
    spacing: 8,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            overflow: 'hidden',
          },
        },
      },
      MuiButton: {
        defaultProps: { size: 'small', disableElevation: true },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },
      MuiFormControl: {
        defaultProps: { size: 'small' },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: { paddingTop: 3, paddingBottom: 3, textTransform: 'none' },
        },
      },
      MuiToggleButtonGroup: {
        defaultProps: { size: 'small' },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
      },
      MuiChip: {
        defaultProps: { size: 'small' },
      },
      MuiIconButton: {
        defaultProps: { size: 'small' },
      },
      MuiCheckbox: {
        defaultProps: { size: 'small' },
      },
      MuiSwitch: {
        defaultProps: { size: 'small' },
      },
      MuiInputLabel: {
        styleOverrides: { root: { fontSize: 13 } },
      },
      MuiMenuItem: {
        styleOverrides: { root: { fontSize: 13 } },
      },
    },
  });
}
