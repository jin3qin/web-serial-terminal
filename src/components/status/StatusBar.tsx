/**
 * 底部状态栏：端口名 / 波特率 / RX / TX / 连接时长 / 时钟 / 提示。
 */

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useSerialStore } from '@/store/useSerialStore';
import { useMessageStore } from '@/store/useMessageStore';
import { formatBytes, formatClock, formatConfigSummary, formatDuration } from '@/utils/format';
import { PERF } from '@/types/serial';

/** 单个状态项 */
interface StatusItemProps {
  icon?: JSX.Element;
  label: string;
  value: string;
  tooltip?: string;
}

/** 状态项渲染 */
function StatusItem({ icon, label, value, tooltip }: StatusItemProps): JSX.Element {
  const content = (
    <Box className="flex items-center gap-1">
      {icon}
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" className="spdt-mono" sx={{ fontSize: 11.5 }}>
        {value}
      </Typography>
    </Box>
  );
  return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
}

/** 状态栏 */
export default function StatusBar(): JSX.Element {
  const connectionState = useSerialStore((s) => s.connectionState);
  const portLabel = useSerialStore((s) => s.portLabel);
  const config = useSerialStore((s) => s.config);
  const stats = useSerialStore((s) => s.stats);
  const lastError = useSerialStore((s) => s.lastError);
  const messageCount = useMessageStore((s) => s.messages.length);

  const [now, setNow] = useState<number>(() => Date.now());

  // 每秒刷新时钟与连接时长
  useEffect(() => {
    const timer: number = window.setInterval(() => setNow(Date.now()), 1000);
    return (): void => {
      window.clearInterval(timer);
    };
  }, []);

  const connected: boolean = connectionState === 'connected';
  const duration: string = stats.connectedAt !== null ? formatDuration(now - stats.connectedAt) : '--:--';

  return (
    <Box
      className="flex flex-wrap items-center gap-3 px-3 py-1"
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        minHeight: 30,
      }}
    >
      <StatusItem label="端口" value={connected && portLabel ? portLabel : '未连接'} />
      <Divider orientation="vertical" flexItem />
      <StatusItem
        label="参数"
        value={formatConfigSummary(config.baudRate, config.dataBits, config.parity, config.stopBits)}
        tooltip="波特率-数据位-校验-停止位"
      />
      <Divider orientation="vertical" flexItem />
      <StatusItem
        icon={<ArrowDownwardIcon sx={{ fontSize: 14 }} color="success" />}
        label="RX"
        value={`${formatBytes(stats.rxBytes)} / ${stats.rxFrames} 帧`}
      />
      <StatusItem
        icon={<ArrowUpwardIcon sx={{ fontSize: 14 }} color="primary" />}
        label="TX"
        value={`${formatBytes(stats.txBytes)} / ${stats.txFrames} 帧`}
      />
      <Divider orientation="vertical" flexItem />
      <StatusItem
        icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
        label="时长"
        value={duration}
      />
      <StatusItem
        icon={<ChatBubbleOutlineIcon sx={{ fontSize: 14 }} />}
        label="消息"
        value={`${messageCount} / ${PERF.MAX_MESSAGES}`}
        tooltip="环形缓冲上限 5000 条，超出自动丢弃最旧记录"
      />

      <Box className="grow" />

      {lastError && !lastError.benign ? (
        <Typography variant="caption" color="error" className="truncate" sx={{ maxWidth: 420 }}>
          {lastError.message}
        </Typography>
      ) : null}

      <Typography variant="caption" color="text.secondary" className="spdt-mono">
        {formatClock(now)}
      </Typography>
    </Box>
  );
}
