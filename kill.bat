@echo off
echo 正在关闭所有 Web Serial Terminal 进程...
taskkill /F /IM web-serial-terminal.exe 2>nul
if %ERRORLEVEL% EQU 0 (
    echo 已成功关闭进程
) else (
    echo 没有找到运行中的进程
)
pause