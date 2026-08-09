# 待实现功能清单

> 最后更新：2026-08-07

## 第二优先级（用户体验）

### 1. 配置文件

**状态**：未完成

**功能描述**：
- 实现将所有快捷指令保存到一个配置文件
- 实现配置文件的导入导出

### 2. 需要完善的内容

**状态**：部分完成

**功能描述**：
- ✅ 端口处于连接状态时，网页意外关闭，需要自动关闭端口
- ✅ 实现打开多个网页窗口时，可以连接多个设备
- 实现可以更改server的配置，如可更改端口号
- 实现server可缩小到托盘，若已经缩小到托盘，则点击exe文件时打开一个网页

**已完成项**：
- **自动关闭端口**：
  - 监听 beforeunload、pagehide 事件
  - 页面关闭、刷新时自动断开设备连接
  - 实现文件：[src/App.tsx](src/App.tsx)
  
- **多窗口多设备**：
  - 后端：每个WebSocket会话独立管理串口
  - 前端：每个窗口独立创建SerialService实例
  - 支持：多个窗口连接不同设备，数据隔离
  - 实现文件：[backend/internal/ws/handler.go](backend/internal/ws/handler.go)、[src/hooks/useSerialConnection.ts](src/hooks/useSerialConnection.ts)
