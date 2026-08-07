@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM Serial Debug Tool - Windows Build Script
REM Build frontend + Go backend -> dist/serial-debug-tool.exe
REM ============================================================

cd /d "%~dp0"

echo.
echo ========================================
echo   Serial Debug Tool - Build Script
echo ========================================
echo.

REM ============================================================
REM Step 1: Check Dependencies
REM ============================================================
echo [1/4] Checking dependencies...

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

where go >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Go not found
    echo Please install Go 1.21+ from https://go.dev/dl/
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node -v') do set NODE_VERSION=%%a
for /f "tokens=*" %%a in ('go version') do set GO_VERSION=%%a
echo   Node.js: %NODE_VERSION%
echo   Go: %GO_VERSION%

REM ============================================================
REM Step 2: Build Frontend
REM ============================================================
echo.
echo [2/4] Building frontend...

if not exist "node_modules" (
    echo   First run, installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

echo   Running npm run build...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)

if not exist "dist\index.html" (
    echo [ERROR] Frontend build output not found (dist/index.html)
    pause
    exit /b 1
)

echo   Frontend build success: dist/

REM ============================================================
REM Step 3: Prepare Go Backend Static Files
REM ============================================================
echo.
echo [3/4] Preparing Go backend static files...

REM Create directory for embedded static files
if not exist "backend\internal\static\dist" mkdir backend\internal\static\dist
if exist "backend\internal\static\dist" (
    echo   Removing old static files...
    rmdir /s /q backend\internal\static\dist
    mkdir backend\internal\static\dist
)

echo   Copying dist/ to backend/internal/static/dist/
xcopy /E /I /Q dist backend\internal\static\dist >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to copy static files
    pause
    exit /b 1
)

REM ============================================================
REM Step 4: Build Go Backend
REM ============================================================
echo.
echo [4/4] Building Go backend...

cd backend

if not exist "go.mod" (
    echo [ERROR] backend/go.mod not found
    cd ..
    pause
    exit /b 1
)

if not exist "go.sum" (
    echo   First run, downloading Go dependencies...
    go mod download
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] go mod download failed (check network connection)
        cd ..
        pause
        exit /b 1
    )
)

REM Get version from git tag or use default
set VERSION=v1.0.0
where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%a in ('git describe --tags --always 2^>nul') do set VERSION=%%a
    if "!VERSION!"=="" set VERSION=v1.0.0
)

REM Build parameters
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0

echo   Version: %VERSION%
echo   Building Go backend...
echo   Output: ..\dist\serial-debug-tool.exe

go build -ldflags="-H windowsgui -s -w -X main.Version=%VERSION%" -o "..\dist\serial-debug-tool.exe" .

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Go build failed! Error code: %ERRORLEVEL%
    echo Please check:
    echo   1. backend/main.go exists
    echo   2. Go code has no syntax errors
    echo   3. Try: cd backend ^&^& go build
    cd ..
    pause
    exit /b 1
)

cd ..

REM ============================================================
REM Build Complete
REM ============================================================
echo.
echo ========================================
echo   Build Success!
echo ========================================
echo.
echo   Output: dist\serial-debug-tool.exe

if not exist "dist\serial-debug-tool.exe" (
    echo [WARNING] Executable not found, build may have failed
)

if exist "dist\serial-debug-tool.exe" (
    for %%a in (dist\serial-debug-tool.exe) do echo   Size: %%~za bytes
)

echo.
echo   Usage:
echo     1. Double-click dist\serial-debug-tool.exe to start
echo     2. Browser opens automatically at http://localhost:8080
echo     3. Select serial port and start debugging
echo.
echo   Notes:
echo     - First run may need Windows firewall approval
echo     - Serial devices need correct drivers installed
echo.

pause