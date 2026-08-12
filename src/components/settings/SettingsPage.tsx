/**
 * Settings page for configuring server port and other options.
 */

import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import IconButton from '@mui/material/IconButton';

interface ServerConfig {
  port: number;
  autoOpen: boolean;
}

export default function SettingsPage(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ServerConfig>({ port: 8080, autoOpen: true });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Navigate back to home
  const handleBack = useCallback((): void => {
    window.location.href = '/';
  }, []);

  // Load current config
  useEffect(() => {
    const fetchConfig = async (): Promise<void> => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          setConfig({
            port: data.port || 8080,
            autoOpen: data.autoOpen ?? true,
          });
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        setSnackbar({ open: true, message: '加载配置失败', severity: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Save config
  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const data = await response.json();
        setSnackbar({
          open: true,
          message: data.message || '配置已保存',
          severity: 'warning', // Warning because restart is needed
        });
      } else {
        const error = await response.json();
        setSnackbar({ open: true, message: error.error || '保存失败', severity: 'error' });
      }
    } catch (error) {
      setSnackbar({ open: true, message: '保存配置失败', severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handlePortChange = useCallback((value: string): void => {
    const port = parseInt(value, 10);
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      setConfig(prev => ({ ...prev, port }));
    }
  }, []);

  const handleAutoOpenChange = useCallback((checked: boolean): void => {
    setConfig(prev => ({ ...prev, autoOpen: checked }));
  }, []);

  if (loading) {
    return (
      <Box className="flex items-center justify-center min-h-screen">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="min-h-screen p-4" sx={{ bgcolor: 'background.default' }}>
      <Box className="max-w-md mx-auto">
        {/* Header */}
        <Box className="flex items-center gap-2 mb-4">
          <IconButton onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">设置</Typography>
        </Box>

        {/* Settings Card */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Typography variant="subtitle1" color="text.secondary">
              服务器设置
            </Typography>

            <TextField
              label="端口号"
              type="number"
              value={config.port}
              onChange={(e) => handlePortChange(e.target.value)}
              fullWidth
              helperText="范围: 1-65535，修改后需要重启应用"
              inputProps={{ min: 1, max: 65535 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={config.autoOpen}
                  onChange={(e) => handleAutoOpenChange(e.target.checked)}
                />
              }
              label="启动时自动打开浏览器"
            />

            <Box className="flex gap-2 mt-2">
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={16} /> : null}
              >
                {saving ? '保存中...' : '保存设置'}
              </Button>
            </Box>

            <Alert severity="info" className="mt-2">
              修改端口号后需要重启应用程序才能生效
            </Alert>
          </CardContent>
        </Card>

        {/* Version Info */}
        <Card className="mt-4">
          <CardContent>
            <Typography variant="subtitle1" color="text.secondary">
              关于
            </Typography>
            <Typography variant="body2">
              Web Serial Terminal v1.0.0
            </Typography>
            <Typography variant="body2" color="text.secondary">
              基于 Web Serial API 的串口调试终端
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
