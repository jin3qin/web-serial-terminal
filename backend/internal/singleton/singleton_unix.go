//go:build !windows

// Package singleton provides single instance detection for Unix-like systems.
package singleton

import (
	"os"
	"path/filepath"
	"syscall"
)

var globalLockFile *os.File

// IsRunning checks if another instance is already running using file lock.
func IsRunning(appName string) bool {
	lockPath := filepath.Join(os.TempDir(), appName+".lock")

	// Try to create and lock the file
	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return true // Assume another instance is running
	}

	// Try to acquire an exclusive lock
	err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err != nil {
		// Lock failed, another instance is running
		file.Close()
		return true
	}

	// We got the lock, keep file alive
	globalLockFile = file
	return false
}

// Release releases the file lock (call on exit).
func Release() {
	if globalLockFile != nil {
		syscall.Flock(int(globalLockFile.Fd()), syscall.LOCK_UN)
		globalLockFile.Close()
		globalLockFile = nil
	}
}

// CreateLockFile creates a lock file with the current PID.
func CreateLockFile(appName string) error {
	lockPath := filepath.Join(os.TempDir(), appName+".lock")
	return os.WriteFile(lockPath, []byte("running"), 0644)
}

// RemoveLockFile removes the lock file.
func RemoveLockFile(appName string) error {
	lockPath := filepath.Join(os.TempDir(), appName+".lock")
	return os.Remove(lockPath)
}
