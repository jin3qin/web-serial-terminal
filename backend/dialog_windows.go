//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// showErrorDialog displays an error message box on Windows
func showErrorDialog(title, message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")

	titlePtr, _ := syscall.UTF16PtrFromString(title)
	messagePtr, _ := syscall.UTF16PtrFromString(message)

	messageBox.Call(
		0,
		uintptr(unsafe.Pointer(messagePtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		0x10, // MB_ICONERROR | MB_OK
	)
}
