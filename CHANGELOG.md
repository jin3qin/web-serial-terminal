# Changelog

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 待添加的新功能

## [1.1.0] - 2026-08-12

### Added

- **核心功能**
  - 端口授权与连接
  - 串口参数配置（波特率/数据位/停止位/校验/流控）
  - 文本收发
  - HEX 收发
  - ASCII/HEX 显示切换
  - 连接状态指示
  - 断开连接

- **增强功能**
  - 时间戳显示：`HH:mm:ss.SSS` 格式，可开关
  - 日志导出：导出为 `.txt` 文件
  - 虚拟滚动：使用 `react-window` 优化高频数据渲染
  - 批量刷新节流：60ms 批量刷新避免卡顿
  - 自动发送：定时发送、定次发送、断开自动停止、自校正定时器
  - 发送历史：最近 50 条、点击回填、双击直发、清空、持久化
  - 配置持久化：参数保存到 localStorage，刷新后恢复
  - 多编码支持：UTF-8 / GBK 编码（懒加载），解码失败自动降级

- **高级功能**
  - 明暗主题：主题切换按钮，持久化到 localStorage
  - RTS/DTR 信号线控制：一键下载复位、输入信号线显示
  - 快捷指令面板：分组管理、导入导出、持久化
  - 多窗口多设备：支持同时打开多个窗口连接不同设备，数据隔离
  - 自动断开：页面关闭/刷新时自动断开串口连接

- **桌面版**
  - Windows 桌面应用打包
  - 系统托盘：最小化到托盘、托盘菜单
  - 单实例检测：防止多开
  - 自动打开浏览器

- **项目配置**
  - MIT License
  - GitHub Actions CI/CD
  - Issue 模板（Bug 报告、功能请求）
  - 自动发布 Release

### Technical

- 前端：React 18 + TypeScript + Vite + MUI + Tailwind CSS
- 后端：Go + Gin + WebSocket
- 版本号通过 Git Tag 管理

---

## 版本说明

- **[Unreleased]**: 开发中的功能，尚未发布
- **[1.1.0]**: 首个正式发布版本
