# Web Serial Terminal · Go 后端网关

Web Serial Terminal 的后端服务，使用 Go + Gin + WebSocket 实现。

## 功能

- 跨平台串口枚举与访问（Windows COM / Linux ttyUSB）
- WebSocket 全双工通信
- 自动打开浏览器
- 端口冲突自动切换
- 配置持久化

## 构建步骤

### 1. 前端构建

```bash
# 在项目根目录执行
cd ..
npm install
npm run build
# 将 dist/ 目录复制到 backend/static/dist/
cp -r dist backend/static/
```

### 2. 后端构建

**Windows:**
```batch
cd backend
go mod download
build\windows.bat
```

**Linux:**
```bash
cd backend
go mod download
bash build/linux.sh
```

**使用 Makefile:**
```bash
# Windows
make build-windows

# Linux
make build-linux

# 全部
make build-all
```

### 3. 运行

**开发模式:**
```bash
cd backend
go run .
```

**生产模式:**
```bash
# Windows
dist\web-serial-terminal.exe

# Linux
./dist/web-serial-terminal
```

## 配置

配置文件 `config.json` 与可执行文件同级：

```json
{
  "port": 8080,
  "logLevel": "INFO",
  "autoOpen": true
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| port | int | 8080 | Web 服务监听端口 |
| logLevel | string | INFO | 日志级别 (DEBUG/INFO/WARN/ERROR) |
| autoOpen | bool | true | 启动时是否自动打开浏览器 |

## WebSocket 协议

### 请求格式

```json
{
  "cmd": "connect",
  "seq": 1,
  "payload": { ... }
}
```

### 响应格式

```json
{
  "cmd": "connect",
  "seq": 1,
  "code": 0,
  "message": "操作成功",
  "data": { ... }
}
```

### 支持的命令

| 命令 | 说明 |
|------|------|
| list_ports | 枚举可用串口 |
| connect | 打开串口 |
| disconnect | 关闭串口 |
| send | 发送数据 |
| set_signals | 设置 RTS/DTR |
| get_signals | 获取信号状态 |

### 错误码

| 码值 | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 端口不存在 |
| 1002 | 端口被占用 |
| 1003 | 参数错误 |
| 1004 | 未连接 |
| 1005 | 发送失败 |

## API 端点

| 端点 | 说明 |
|------|------|
| GET / | 前端页面 |
| GET /ws | WebSocket 连接 |
| GET /api/health | 健康检查 |

## 技术栈

- Go 1.21+
- Gin v1.10+
- gorilla/websocket v1.5+
- go.bug.st/serial v1.6+

## 目录结构

```
backend/
├── main.go              # 入口
├── go.mod               # Go 模块定义
├── internal/
│   ├── config/          # 配置管理
│   ├── serial/          # 串口服务
│   ├── ws/              # WebSocket 处理
│   ├── static/          # 前端嵌入
│   └── browser/         # 浏览器启动
├── build/               # 编译脚本
└── README.md
```

## 许可证

MIT License