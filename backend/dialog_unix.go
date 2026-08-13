//go:build !windows

package main

import (
	"fmt"
	"os"
)

// showErrorDialog displays an error message to stderr on Unix-like systems
func showErrorDialog(title, message string) {
	fmt.Fprintf(os.Stderr, "\n[ERROR] %s\n%s\n\n", title, message)
}
