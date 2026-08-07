// Package types provides shared type definitions for the serial debug tool.
package types

// PortInfo describes a detected serial port.
type PortInfo struct {
	Name        string
	Description string
	VID         string
	PID         string
}

// OpenConfig holds serial port configuration.
type OpenConfig struct {
	BaudRate    int
	DataBits    int
	StopBits    int
	Parity      string // "none", "even", "odd"
	FlowControl string // "none", "hardware"
}

// SignalsStatus represents the state of control signals.
type SignalsStatus struct {
	RTS bool // Output
	DTR bool // Output
	CTS bool // Input
	DSR bool // Input
	DCD bool // Input
	RI  bool // Input
}