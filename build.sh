#!/bin/bash
# Web Serial Terminal - 构建脚本（Git Bash 版本）

set -e  # 遇到错误立即退出

echo "========================================"
echo "  Web Serial Terminal - Build Script"
echo "========================================"
echo ""

# 步骤1: 检查依赖
echo "[1/4] Checking dependencies..."
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js not found"; exit 1; }
command -v go >/dev/null 2>&1 || { echo "[ERROR] Go not found"; exit 1; }
echo "  Node.js: $(node -v)"
echo "  Go: $(go version | awk '{print $3}')"
echo ""

# 步骤2: 构建前端
echo "[2/4] Building frontend..."
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install
fi

echo "  Running npm run build..."
npm run build

if [ ! -f "dist/index.html" ]; then
    echo "[ERROR] Frontend build failed"
    exit 1
fi
echo "  Frontend build success: dist/"
echo ""

# 步骤3: 准备静态文件
echo "[3/4] Preparing Go backend static files..."
echo "  Removing old static files..."
rm -rf backend/internal/static/dist/*

echo "  Copying dist/ to backend/internal/static/dist/"
mkdir -p backend/internal/static/dist
cp -r dist/* backend/internal/static/dist/
echo "  Static files copied successfully"
echo ""

# 步骤4: 构建 Go 后端
echo "[4/4] Building Go backend..."
cd backend

# 嵌入 Windows 应用图标（生成 rsrc.syso，go build 会自动链接同目录 .syso）
export PATH="$PATH:$(go env GOPATH)/bin"
if [ -f appicon.ico ]; then
    if ! command -v rsrc >/dev/null 2>&1; then
        echo "  rsrc not found, installing..."
        go install github.com/akavel/rsrc@latest
        if [ $? -ne 0 ]; then
            echo "[WARNING] Failed to install rsrc, skipping icon embedding"
        else
            echo "  Embedding application icon..."
            GOOS=windows rsrc -arch amd64 -ico appicon.ico -o rsrc.syso
        fi
    else
        echo "  Embedding application icon..."
        GOOS=windows rsrc -arch amd64 -ico appicon.ico -o rsrc.syso
    fi
fi

VERSION=$(git describe --tags --always 2>/dev/null || echo "v1.0.0")
echo "  Version: $VERSION"
echo "  Building Go backend..."
echo "  Output: ../dist/web-serial-terminal.exe"

CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
    go build -ldflags="-s -w -X main.Version=$VERSION" \
    -o ../dist/web-serial-terminal.exe .

if [ $? -ne 0 ]; then
    echo "[ERROR] Go build failed"
    cd ..
    exit 1
fi

cd ..

# 验证构建
echo ""
echo "========================================"
echo "  Build Success!"
echo "========================================"
echo ""

if [ -f "dist/web-serial-terminal.exe" ]; then
    SIZE=$(ls -lh dist/web-serial-terminal.exe | awk '{print $5}')
    echo "  Output: dist/web-serial-terminal.exe"
    echo "  Size: $SIZE"
    echo ""
    echo "  Usage:"
    echo "    1. Double-click dist/web-serial-terminal.exe to start"
    echo "    2. Browser opens automatically at http://localhost:8080"
    echo "    3. Select serial port and start debugging"
else
    echo "[WARNING] Executable not found"
fi

echo ""