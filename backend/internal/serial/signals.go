package serial

// This file is intentionally minimal - signal handling is integrated
// into manager.go and port.go. This file exists to clarify the
// structure and could hold future signal-related utilities.

// SignalConstants defines standard serial signal line names.
var SignalConstants = struct {
	RTS string // Request To Send (output)
	DTR string // Data Terminal Ready (output)
	CTS string // Clear To Send (input)
	DSR string // Data Set Ready (input)
	DCD string // Data Carrier Detect (input)
	RI  string // Ring Indicator (input)
}{
	RTS: "RTS",
	DTR: "DTR",
	CTS: "CTS",
	DSR: "DSR",
	DCD: "DCD",
	RI:  "RI",
}