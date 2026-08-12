/**
 * 不支持引导页：说明原因（非 Chromium / 非 HTTPS）并给出解决指引。
 */

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import UsbIcon from '@mui/icons-material/Usb';
import { detect } from '@/serial/serialSupport';
import type { SupportResult } from '@/types/serial';

/** 引导页组件 */
export default function UnsupportedBrowserNotice(): JSX.Element {
  const result: SupportResult = detect();

  const checks: ReadonlyArray<{ label: string; ok: boolean; hint: string }> = [
    {
      label: '浏览器支持 Web Serial API',
      ok: result.hasApi,
      hint: '需要 Chrome / Edge / Opera 等 Chromium 内核浏览器，版本 89 及以上。',
    },
    {
      label: '页面运行在安全上下文',
      ok: result.isSecure,
      hint: '需通过 https:// 访问，或使用 http://localhost 本地调试。',
    },
  ];

  return (
    <Box className="flex h-full w-full items-center justify-center overflow-auto p-6">
      <Paper elevation={3} className="w-full max-w-2xl p-6" sx={{ p: 3 }}>
        <Box className="mb-4 flex items-center gap-2" sx={{ mb: 2 }}>
          <UsbIcon color="primary" />
          <Typography variant="h6">Web Serial Terminal</Typography>
        </Box>

        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>当前环境无法使用串口功能</AlertTitle>
          {result.detail}
        </Alert>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          环境检测结果
        </Typography>
        <List dense disablePadding>
          {checks.map((c) => (
            <ListItem key={c.label} disableGutters>
              <ListItemIcon sx={{ minWidth: 34 }}>
                {c.ok ? (
                  <CheckCircleOutlineIcon color="success" fontSize="small" />
                ) : (
                  <HighlightOffIcon color="error" fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText primary={c.label} secondary={c.ok ? '通过' : c.hint} />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          当前环境
        </Typography>
        <Box className="mb-4 flex flex-wrap gap-2" sx={{ mb: 2 }}>
          <Chip label={`浏览器：${result.browser}`} />
          <Chip
            label={`安全上下文：${result.isSecure ? '是' : '否'}`}
            color={result.isSecure ? 'success' : 'error'}
            variant="outlined"
          />
          <Chip
            label={`navigator.serial：${result.hasApi ? '可用' : '不可用'}`}
            color={result.hasApi ? 'success' : 'error'}
            variant="outlined"
          />
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          解决办法
        </Typography>
        <Typography variant="body2" component="div">
          <ol className="m-0 list-decimal pl-5">
            <li>使用 Google Chrome 或 Microsoft Edge（89 及以上版本）打开本页面。</li>
            <li>确保访问地址为 <code>https://</code> 开头，或本地开发时使用 <code>http://localhost</code>。</li>
            <li>Linux 用户请确认当前账号有串口设备权限（通常需加入 <code>dialout</code> 用户组）。</li>
            <li>若使用企业受管浏览器，请确认策略未禁用 <code>Serial API</code>。</li>
          </ol>
        </Typography>

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Web Serial API 是浏览器与本地串口设备通信的标准接口，出于安全考虑仅在受信任环境中开放。
        </Typography>
      </Paper>
    </Box>
  );
}
