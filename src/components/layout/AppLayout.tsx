/**
 * 主布局：顶部工具栏（连接 + 参数 + 高级控制线）/ 左发送区 / 右接收区 / 底部状态栏。
 * 布局使用 Tailwind，视觉交给 MUI（§8.7）。
 */

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import ConnectionToolbar from '@/components/toolbar/ConnectionToolbar';
import SerialConfigForm from '@/components/toolbar/SerialConfigForm';
import SignalControl from '@/components/toolbar/SignalControl';
import SendPanel from '@/components/send/SendPanel';
import ReceivePanel from '@/components/receive/ReceivePanel';
import StatusBar from '@/components/status/StatusBar';
import { useUiStore } from '@/store/useUiStore';

/** 应用主布局 */
export default function AppLayout(): JSX.Element {
  const advancedOpen = useUiStore((s) => s.advancedOpen);

  return (
    <Box className="flex h-full w-full flex-col" sx={{ backgroundColor: 'background.default' }}>
      {/* 顶部工具栏 */}
      <Paper
        square
        elevation={0}
        className="flex flex-col gap-2 px-3 py-2"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <ConnectionToolbar />
        <SerialConfigForm />
        <Collapse in={advancedOpen} unmountOnExit>
          <Box className="pt-2">
            <Divider className="mb-2" sx={{ mb: 1 }} />
            <SignalControl />
          </Box>
        </Collapse>
      </Paper>

      {/* 主体：左发送 / 右接收 */}
      <Box className="flex min-h-0 grow flex-col gap-2 p-2 lg:flex-row">
        <Box className="flex min-h-0 w-full flex-col lg:w-[420px] lg:shrink-0">
          <SendPanel />
        </Box>
        <Box className="flex min-h-0 grow flex-col">
          <ReceivePanel />
        </Box>
      </Box>

      {/* 底部状态栏 */}
      <StatusBar />
    </Box>
  );
}
