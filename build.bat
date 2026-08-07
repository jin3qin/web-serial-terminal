@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ========================================
echo   Serial Debug Tool - Build Script
echo ========================================
echo.

REM Step 1: Check dependencies
echo [1/4] Checking dependencies...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

where go >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Go not found
    pause
    exit /b 1
)

echo   Node.js and Go found
echo.

REM Step 2: Build Frontend
echo [2/4] Building frontend...
if not exist "node_modules" (
    call npm install
)

call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)

if not exist "dist\index.html" (
    echo [ERROR] dist/index.html not found
    pause
    exit /b 1
)

echo   Frontend build success
echo.

REM Step 3: Copy static files
echo [3/4] Copying static files...
if exist "backend\internal\static\dist" rmdir /s /q "backend\internal\static\dist"
mkdir "backend\internal\static\dist"
xcopy /E /I /Y dist backend\internal\static\dist >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy static files
    pause
    exit /b 1
)
echo   Static files copied
echo.

REM Step 4: Build Go backend
echo [4/4] Building Go backend...
cd backend

if not exist "go.sum" (
    go mod download
)

go build -ldflags="-s -w" -o "..\dist\serial-debug-tool.exe" .
if errorlevel 1 (
    echo [ERROR] Go build failed
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo   Build Success!
echo ========================================
echo.
if exist "dist\serial-debug-tool.exe" (
    echo   Output: dist\serial-debug-tool.exe
    for %%a in (dist\serial-debug-tool.exe) do echo   Size: %%~za bytes
) else (
    echo [ERROR] Executable not found
)
echo.

pause
