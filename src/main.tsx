/**
 * 应用入口：React 挂载 + MUI ThemeProvider + CssBaseline + 全局错误边界。
 */

import React, { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import App from '@/App';
import { createAppTheme } from '@/theme/theme';
import { useUiStore } from '@/store/useUiStore';
import '@/index.css';

/* ==========================================================================
 * 全局错误边界
 * ========================================================================== */

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  /**
   * 捕获渲染期异常。
   *
   * @param error 异常对象
   */
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  /**
   * 记录错误详情。
   *
   * @param error 异常
   * @param info React 组件栈
   */
  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[GlobalErrorBoundary]', error, info.componentStack);
  }

  /** 重载页面 */
  private readonly handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Box className="flex h-full w-full items-center justify-center p-6">
          <Paper className="max-w-xl p-6" elevation={3}>
            <Typography variant="h6" color="error" gutterBottom>
              页面渲染出错
            </Typography>
            <Typography variant="body2" className="mb-4" sx={{ mb: 2 }}>
              {this.state.message || '发生了未知错误。'}
            </Typography>
            <Button variant="contained" onClick={this.handleReload}>
              重新加载
            </Button>
          </Paper>
        </Box>
      );
    }
    return this.props.children;
  }
}

/* ==========================================================================
 * 主题容器
 * ========================================================================== */

/** 根据 UI Store 的主题模式提供 MUI 主题，并同步 Tailwind 的 dark class */
function ThemedApp(): JSX.Element {
  const mode = useUiStore((s) => s.themeMode);
  const theme = React.useMemo(() => createAppTheme(mode), [mode]);

  React.useEffect(() => {
    const root: HTMLElement = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = mode;
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

/* ==========================================================================
 * 挂载
 * ========================================================================== */

const container: HTMLElement | null = document.getElementById('root');
if (!container) {
  throw new Error('找不到挂载节点 #root');
}

createRoot(container).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <ThemedApp />
    </GlobalErrorBoundary>
  </StrictMode>,
);
