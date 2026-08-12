@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ========================================
echo   Web Serial Terminal - Build Script
echo ========================================
echo.

REM Step 1: Check and close running process
echo [0/4] Checking for running instances...
set "EXE_NAME=web-serial-terminal.exe"
set "CLOSED=0"

tasklist /FI "IMAGENAME eq %EXE_NAME%" 2>nul | find "%EXE_NAME%" >nul
if not errorlevel 1 (
    echo   %EXE_NAME% is running, attempting to close...

    REM Try graceful shutdown first
    taskkill /IM "%EXE_NAME%" >nul 2>&1
    if errorlevel 1 (
        REM If graceful shutdown fails, force kill
        taskkill /F /IM "%EXE_NAME%" >nul 2>&1
    )

    REM Wait for process to close
    timeout /t 2 /nobreak >nul

    REM Check if closed successfully
    tasklist /FI "IMAGENAME eq %EXE_NAME%" 2>nul | find "%EXE_NAME%" >nul
    if errorlevel 1 (
        echo   Process closed successfully
        set "CLOSED=1"
    ) else (
        echo   [WARNING] Failed to close process, will retry during build
    )
) else (
    echo   No running instance found
)
echo.

REM Step 2: Check dependencies
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

REM Step 3: Build Frontend
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

REM Step 4: Copy static files
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

REM Step 5: Build Go backend (with retry if exe is locked)
echo [4/4] Building Go backend...
cd backend

REM Embed Windows application icon into the exe (generates rsrc.syso)
set "PATH=%PATH%;%USERPROFILE%\go\bin"
if exist appicon.ico (
    echo   Embedding application icon...

    REM Check if rsrc is installed
    where rsrc >nul 2>&1
    if errorlevel 1 (
        echo   rsrc not found, installing...
        go install github.com/akavel/rsrc@latest
        if errorlevel 1 (
            echo [WARNING] Failed to install rsrc, skipping icon embedding
        ) else (
            rsrc -arch amd64 -ico appicon.ico -o rsrc.syso
        )
    ) else (
        rsrc -arch amd64 -ico appicon.ico -o rsrc.syso
    )
)

if not exist "go.sum" (
    go mod download
)

REM Try to build, retry once if exe is locked
set "BUILD_ATTEMPT=1"
set "MAX_ATTEMPTS=2"

:BuildLoop
go build -ldflags="-H windowsgui -s -w" -o "..\dist\web-serial-terminal.exe" .
if not errorlevel 1 (
    REM Build succeeded
    goto BuildSuccess
)

REM Build failed
if %BUILD_ATTEMPT% LSS %MAX_ATTEMPTS% (
    echo   Build failed, attempting to close process and retry...

    REM Try to force kill the process
    taskkill /F /IM "%EXE_NAME%" >nul 2>&1

    REM Wait a moment
    timeout /t 2 /nobreak >nul

    set /a BUILD_ATTEMPT+=1
    goto BuildLoop
)

REM Build failed after all attempts
echo [ERROR] Go build failed after %MAX_ATTEMPTS% attempts
cd ..
pause
exit /b 1

:BuildSuccess
cd ..

echo.
echo ========================================
echo   Build Success!
echo ========================================
echo.
if exist "dist\web-serial-terminal.exe" (
    echo   Output: dist\web-serial-terminal.exe
    for %%a in (dist\web-serial-terminal.exe) do echo   Size: %%~za bytes
    if "%CLOSED%" EQU "1" (
        echo.
        echo   [INFO] Previous instance was closed during build
    )
) else (
    echo [ERROR] Executable not found
)
echo.

pause