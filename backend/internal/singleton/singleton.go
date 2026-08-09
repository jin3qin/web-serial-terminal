// Package singleton provides single instance detection.
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
	}
	return nil
}

// IsRunning checks if another instance is already running.
// Uses a lock file approach as backup.
func IsRunning(appName string) bool {
	// Try mutex first
	mutex, isFirst := NewMutex("Global\\" + appName)
	if mutex != nil {
		if isFirst {
			// We're the first instance, keep mutex alive
			return false
		}
		// Another instance exists
		return true
	}

	// Fallback: check lock file
	lockPath := filepath.Join(os.TempDir(), appName+".lock")
	data, err := os.ReadFile(lockPath)
	if err == nil {
		// Lock file exists, check if process is still running
		// This is a simplified check
		return true
	}

	return false
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