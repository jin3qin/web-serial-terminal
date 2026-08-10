/**
 * 顶层组装：环境探测分支（引导页 vs 主界面）、配置初始化、全局提示宿主。
 */

import { useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useSerialStore } from '@/store/useSerialStore';
import { useUiStore } from '@/store/useUiStore';
import { serialConnectionApi } from '@/hooks/useSerialConnection';
import AppLayout from '@/components/layout/AppLayout';
import UnsupportedBrowserNotice from '@/components/common/UnsupportedBrowserNotice';
import SettingsPage from '@/components/settings/SettingsPage';

/** 全局 Snackbar 宿主：一次只展示队列中的第一条 */
function GlobalSnackbar(): JSX.Element | null {
  const notices = useUiStore((s) => s.notices);
  const dismiss = useUiStore((s) => s.dismiss);
  const current = notices.length > 0 ? notices[0] : null;

  if (!current) {
    return null;
  }

  return (
    <Snackbar
      key={current.id}
      open
      autoHideDuration={current.duration}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      onClose={() => dismiss(current.id)}
    >
      <Alert
        severity={current.severity}
        variant="filled"
        onClose={() => dismiss(current.id)}
        sx={{ width: '100%' }}
      >
        {current.message}
      </Alert>
    </Snackbar>
  );
}

/** 应用根组件 */
export default function App(): JSX.Element {
  const connectionState = useSerialStore((s) => s.connectionState);

  // Check if we're on the settings page
  const isSettingsPage = useMemo(() => {
    return window.location.pathname === '/settings';
  }, []);

  // 初始化：环境探测 → 配置回填 → 端口枚举（仅执行一次）
  useEffect(() => {
    void serialConnectionApi.initialize();
  }, []);

  // 页面关闭前自动断开设备连接并保存配置
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      // 如果设备处于连接状态，自动断开连接
      if (connectionState === 'connected') {
        serialConnectionApi.disconnect().catch(() => {
          // 忽略断开连接时的错误
        });
      }
      // 保存配置
      serialConnectionApi.persist();
    };

    const handlePageHide = (): void => {
      // pagehide 事件作为备选，确保移动端也能正常工作
      if (connectionState === 'connected') {
        serialConnectionApi.disconnect().catch(() => {
          // 忽略错误
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return (): void => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [connectionState]);

  if (connectionState === 'unsupported') {
    return (
      <Box className="h-full w-full">
        <UnsupportedBrowserNotice />
      </Box>
    );
  }

  // Render settings page if URL is /settings
  if (isSettingsPage) {
    return (
      <Box className="h-full w-full">
        <SettingsPage />
        <GlobalSnackbar />
      </Box>
    );
  }

  return (
    <Box className="h-full w-full">
      <AppLayout />
      <GlobalSnackbar />
    </Box>
  );
}
