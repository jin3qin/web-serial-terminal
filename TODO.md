# 待实现功能清单

> 最后更新：2026-08-07

## 第二优先级（用户体验）

### 1. 配置文件

**状态**：✅ **已完成**

**功能描述**：
- ✅ 实现将所有快捷指令保存到一个配置文件
- ✅ 实现配置文件的导入导出

**实现文件**：
- [src/utils/macroExporter.ts](src/utils/macroExporter.ts) - 导出导入工具函数 ✅
- [src/components/send/MacroPanel.tsx](src/components/send/MacroPanel.tsx) - UI按钮和对话框 ✅

**实现特性**：
- 导出：将快捷指令配置保存为JSON文件
- 导入：从JSON文件加载快捷指令配置
- 数据校验：确保导入数据格式正确
- 错误处理：友好的错误提示
- 文件大小限制：最大1MB
- 向后兼容：支持导入旧版本格式

**验收标准**：
1. 点击导出按钮，下载JSON配置文件 ✅
2. 点击导入按钮，选择配置文件，确认导入 ✅
3. 导入格式错误的文件，显示错误提示 ✅
4. 导入成功，显示分组和快捷指令数量 ✅

### 2. 需要完善的内容

**状态**：部分完成

**功能描述**：
- ✅ 端口处于连接状态时，网页意外关闭，需要自动关闭端口
- ✅ 实现打开多个网页窗口时，可以连接多个设备
- ✅ 实现可以更改server的配置，如可更改端口号
- ✅ 实现server可缩小到托盘，若已经缩小到托盘，则点击exe文件时打开一个网页

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
