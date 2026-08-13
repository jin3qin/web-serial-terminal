//go:build !windows

// Package systray provides system tray functionality.
package systray

import (
	_ "embed"
)

// iconData holds the tray icon bytes, embedded from icon.png.
// Linux AppIndicator requires PNG format icons.
//
//go:embed icon.png
var iconData []byte
