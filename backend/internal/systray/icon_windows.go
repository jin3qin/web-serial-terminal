//go:build windows

// Package systray provides system tray functionality.
package systray

import (
	_ "embed"
)

// iconData holds the tray icon bytes, embedded from icon.ico.
// The file is a multi-size ICO (16/32/48/64/128/256) with an RGBA alpha
// channel, so Windows can pick the DPI-appropriate variant at runtime.
//
//go:embed icon.ico
var iconData []byte
