//go:build windows

// Package singleton provides single instance detection for Windows.
package singleton

import (
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutex = kernel32.NewProc("CreateMutexW")
	globalMutex     *Mutex // Keep mutex alive for the lifetime of the process
)

// Mutex represents a Windows mutex for single instance.
type Mutex struct {
	handle uintptr
}

// NewMutex creates a named mutex for single instance detection.
// Returns the mutex and whether this is the first instance.
func NewMutex(name string) (*Mutex, bool) {
	mutexName, _ := syscall.UTF16PtrFromString(name)
	handle, _, err := procCreateMutex.Call(
		0,
		0,
		uintptr(unsafe.Pointer(mutexName)),
	)
	if handle == 0 {
		return nil, false
	}
	// ERROR_ALREADY_EXISTS = 183
	isFirst := err != syscall.ERROR_ALREADY_EXISTS
	return &Mutex{handle: handle}, isFirst
}

// Close releases the mutex.
func (m *Mutex) Close() error {
	if m.handle != 0 {
		syscall.CloseHandle(syscall.Handle(m.handle))
		m.handle = 0
	}
	return nil
}

// IsRunning checks if another instance is already running.
// Uses a lock file approach as backup.
// If this is the first instance, it keeps the mutex alive.
func IsRunning(appName string) bool {
	// Try mutex first
	mutex, isFirst := NewMutex("Global\\" + appName)
	if mutex != nil {
		if isFirst {
			// We're the first instance, keep mutex alive
			globalMutex = mutex
			return false
		}
		// Another instance exists
		return true
	}

	// Fallback: check lock file
	lockPath := filepath.Join(os.TempDir(), appName+".lock")
	if _, err := os.Stat(lockPath); err == nil {
		// Lock file exists, another instance is running
		return true
	}

	return false
}

// Release releases the global mutex (call on exit).
func Release() {
	if globalMutex != nil {
		globalMutex.Close()
		globalMutex = nil
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
