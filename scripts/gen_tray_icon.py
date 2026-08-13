#!/usr/bin/env python3
"""
Generate tray icon for Linux from the logo.
Requires: pip install Pillow
"""

import os
try:
    from PIL import Image
except ImportError:
    print("Pillow not installed. Install with: pip install Pillow")
    exit(1)

# Paths (script is in scripts/ directory, project root is parent)
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
logo_path = os.path.join(project_root, "assets", "logo", "logo_transparent.png")
output_path = os.path.join(project_root, "backend", "internal", "systray", "icon.png")

# Open and resize logo
img = Image.open(logo_path)

# Resize to 48x48 (standard tray icon size)
img = img.resize((48, 48), Image.Resampling.LANCZOS)

# Save as PNG
img.save(output_path, "PNG")
print(f"Generated: {output_path}")
print(f"Size: {os.path.getsize(output_path)} bytes")
