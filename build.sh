#!/bin/bash
# Web Serial Terminal - Linux/macOS 构建脚本

set -e  # 遇到错误立即退出

echo "========================================"
echo "  Web Serial Terminal - Build Script"
echo "========================================"
echo ""

# 检测操作系统
OS=$(uname -s)
case "$OS" in
    Linux*)  OS_NAME="Linux" ;;
    Darwin*) OS_NAME="macOS" ;;
    *)       OS_NAME="$OS" ;;
esac
echo "  Platform: $OS_NAME"
echo ""

# 步骤1: 检查依赖
echo "[1/4] Checking dependencies..."
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js not found"; exit 1; }
command -v go >/dev/null 2>&1 || { echo "[ERROR] Go not found"; exit 1; }
echo "  Node.js: $(node -v)"
echo "  Go: $(go version | awk '{print $3}')"

# Linux 系统托盘依赖检查
if [ "$OS_NAME" = "Linux" ]; then
    if ! pkg-config --exists gtk+-3.0 2>/dev/null; then
        echo "  [WARNING] GTK3 not found. System tray may not work."
        echo "  Install with: sudo apt-get install libgtk-3-dev libappindicator3-dev"
    fi
fi
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

# 为 Linux/macOS 准备托盘图标（PNG 格式）
if [ ! -f "backend/internal/systray/icon.png" ]; then
    echo "  Generating tray icon..."
    # 尝试使用 Python + Pillow
    if command -v python3 >/dev/null 2>&1 && python3 -c "from PIL import Image" 2>/dev/null; then
        python3 scripts/gen_tray_icon.py
    # 尝试使用 ImageMagick
    elif command -v convert >/dev/null 2>&1; then
        convert -resize 48x48 assets/logo/logo_transparent.png backend/internal/systray/icon.png
        echo "  Generated icon.png using ImageMagick"
    else
        echo "  [WARNING] Could not generate icon.png. System tray will not show icon."
        echo "  Install Pillow (pip install Pillow) or ImageMagick to generate icons."
        # 创建一个空的占位文件避免编译错误
        touch backend/internal/systray/icon.png
    fi
fi

cd backend

VERSION=$(git describe --tags --always 2>/dev/null || echo "v1.0.0")
echo "  Version: $VERSION"
echo "  Building Go backend..."

# 根据操作系统设置构建参数
if [ "$OS_NAME" = "Linux" ]; then
    # Linux 需要 CGO 支持系统托盘
    OUTPUT_FILE="../dist/web-serial-terminal"
    echo "  Output: $OUTPUT_FILE"
    CGO_ENABLED=1 go build -ldflags="-s -w -X main.Version=$VERSION" -o "$OUTPUT_FILE" .
else
    # macOS
    OUTPUT_FILE="../dist/web-serial-terminal"
    echo "  Output: $OUTPUT_FILE"
    CGO_ENABLED=1 go build -ldflags="-s -w -X main.Version=$VERSION" -o "$OUTPUT_FILE" .
fi

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

if [ -f "dist/web-serial-terminal" ]; then
    SIZE=$(ls -lh dist/web-serial-terminal | awk '{print $5}')
    echo "  Output: dist/web-serial-terminal"
    echo "  Size: $SIZE"
    echo ""
    echo "  Usage:"
    echo "    1. Run: ./dist/web-serial-terminal"
    echo "    2. Browser opens automatically at http://localhost:8080"
    echo "    3. Select serial port and start debugging"
    echo ""
    if [ "$OS_NAME" = "Linux" ]; then
        echo "  Note: System tray requires GTK3 and AppIndicator."
        echo "        Install with: sudo apt-get install libgtk-3-dev libappindicator3-dev"
    fi
else
    echo "[WARNING] Executable not found"
fi

echo ""
