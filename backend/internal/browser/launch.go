// Package browser provides cross-platform browser launching.
package browser

import (
	"fmt"
	"os/exec"
	"runtime"
)

// OpenURL opens the given URL in the system's default browser.
func OpenURL(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		// Use 'start' command on Windows
		cmd = exec.Command("cmd", "/c", "start", "", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to open browser: %w", err)
	}

	// Don't wait for browser to close
	return nil
}