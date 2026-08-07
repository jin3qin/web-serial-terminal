@echo off
echo 正在关闭所有串口调试工具进程...
taskkill /F /IM serial-debug-tool.exe 2>nul
if %ERRORLEVEL% EQU 0 (
    echo 已成功关闭进程
) else (
    echo 没有找到运行中的进程
)
pause