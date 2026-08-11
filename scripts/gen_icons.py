# -*- coding: utf-8 -*-
"""Logo 处理与图标资源生成脚本。

功能：
1. 读取 assets/logo/logo.png，将四角残留的黑色不透明像素 (r<30, g<30, b<30, a>200) 置为全透明，
   输出 logo_transparent.png。
2. 基于透明化后的 logo 生成两个 ICO 资源（保留 RGBA 透明通道）：
   - public/favicon.ico    : 网页标签页图标，尺寸 [16, 32, 48]
   - backend/appicon.ico   : Windows exe 程序图标，尺寸 [16, 32, 48, 64, 128, 256]

用法:
    python scripts/gen_icons.py
"""

from __future__ import annotations

import os
import sys
from typing import List, Tuple

from PIL import Image

# ---------------------------------------------------------------------------
# 路径常量（相对脚本位置解析，避免依赖当前工作目录）
# ---------------------------------------------------------------------------
SCRIPT_DIR: str = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT: str = os.path.dirname(SCRIPT_DIR)

LOGO_SRC: str = os.path.join(PROJECT_ROOT, 'assets', 'logo', 'logo.png')
LOGO_TRANSPARENT: str = os.path.join(PROJECT_ROOT, 'assets', 'logo', 'logo_transparent.png')
PUBLIC_DIR: str = os.path.join(PROJECT_ROOT, 'public')
FAVICON_ICO: str = os.path.join(PUBLIC_DIR, 'favicon.ico')
BACKEND_DIR: str = os.path.join(PROJECT_ROOT, 'backend')
APPICON_ICO: str = os.path.join(BACKEND_DIR, 'appicon.ico')

# 黑色残留像素判定阈值
BLACK_THRESHOLD: int = 30
ALPHA_THRESHOLD: int = 200

FAVICON_SIZES: List[Tuple[int, int]] = [(16, 16), (32, 32), (48, 48)]
APPICON_SIZES: List[Tuple[int, int]] = [
    (16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)
]


def strip_black_corners(src_path: str, dst_path: str) -> Image.Image:
    """将图片中近黑色的不透明像素替换为全透明像素。

    Args:
        src_path: 源图片路径。
        dst_path: 处理后 PNG 的输出路径。

    Returns:
        处理后的 RGBA Image 对象。

    Raises:
        FileNotFoundError: 源图片不存在时抛出。
    """
    if not os.path.isfile(src_path):
        raise FileNotFoundError('源 logo 不存在: {0}'.format(src_path))

    img: Image.Image = Image.open(src_path).convert('RGBA')
    pixels = list(img.getdata())
    changed: int = 0
    result = []

    for (r, g, b, a) in pixels:
        if r < BLACK_THRESHOLD and g < BLACK_THRESHOLD and b < BLACK_THRESHOLD and a > ALPHA_THRESHOLD:
            result.append((0, 0, 0, 0))
            changed += 1
        else:
            result.append((r, g, b, a))

    img.putdata(result)
    img.save(dst_path, format='PNG')
    print('[1/3] 透明化完成: {0} (尺寸 {1}, 清除黑色像素 {2} 个)'.format(
        dst_path, img.size, changed))
    return img


def save_ico(img: Image.Image, dst_path: str, sizes: List[Tuple[int, int]], label: str) -> None:
    """从 RGBA 图像生成多尺寸 ICO 文件。

    Args:
        img: 已透明化的 RGBA 图像。
        dst_path: ICO 输出路径。
        sizes: 需要写入 ICO 的尺寸列表。
        label: 日志标签。
    """
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    base: Image.Image = img.convert('RGBA').resize((256, 256), Image.LANCZOS)
    base.save(dst_path, format='ICO', sizes=sizes)
    size_text = ', '.join(['{0}x{1}'.format(w, h) for (w, h) in sizes])
    print('{0}: {1} (尺寸 {2}, {3} 字节)'.format(
        label, dst_path, size_text, os.path.getsize(dst_path)))


def main() -> int:
    """脚本入口。

    Returns:
        进程退出码，0 表示成功。
    """
    try:
        logo: Image.Image = strip_black_corners(LOGO_SRC, LOGO_TRANSPARENT)
    except FileNotFoundError as exc:
        print('[ERROR] {0}'.format(exc), file=sys.stderr)
        return 1

    os.makedirs(PUBLIC_DIR, exist_ok=True)
    os.makedirs(BACKEND_DIR, exist_ok=True)

    save_ico(logo, FAVICON_ICO, FAVICON_SIZES, '[2/3] favicon 生成')
    save_ico(logo, APPICON_ICO, APPICON_SIZES, '[3/3] appicon 生成')

    print('图标资源生成完毕。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
