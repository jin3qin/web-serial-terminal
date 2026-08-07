// Package serial provides serial port management for the debug tool.
package serial

import (
	"encoding/hex"
	"fmt"
	"strings"
	"sync"

	"go.bug.st/serial"
	"serial-debug-tool/internal/types"
)

// Manager handles serial port enumeration and lifecycle.
// It maintains a single active port instance (single-client mode).
type Manager struct {
	mu          sync.RWMutex
	currentPort *Port
	onData      func(direction string, data []byte)
	onDisconnect func()
}

// NewManager creates a new serial port manager.
func NewManager() *Manager {
	return &Manager{}
}

// SetDataCallback sets the callback for received/transmitted data.
func (m *Manager) SetDataCallback(cb func(direction string, data []byte)) {
	m.mu.Lock()
	m.onData = cb
	m.mu.Unlock()
}

// SetDisconnectCallback sets the callback for unexpected disconnections.
func (m *Manager) SetDisconnectCallback(cb func()) {
	m.mu.Lock()
	m.onDisconnect = cb
	m.mu.Unlock()
}

// ListPorts enumerates all available serial ports on the system.
func (m *Manager) ListPorts() ([]types.PortInfo, error) {
	ports, err := serial.GetPortsList()
	if err != nil {
		return nil, fmt.Errorf("failed to list ports: %w", err)
	}

	result := make([]types.PortInfo, 0, len(ports))
	for _, portName := range ports {
		info := types.PortInfo{
			Name:        portName,
			Description: "串口设备",
		}
		result = append(result, info)
	}

	return result, nil
}

// knownDevices maps VID:PID to human-readable names.
var knownDevices = map[string]string{
	"1A86:7523": "CH340 串口",
	"1A86:5523": "CH341 串口",
	"1A86:55D4": "CH9102 串口",
	"10C4:EA60": "CP2102 串口",
	"10C4:EA70": "CP2105 串口",
	"0403:6001": "FT232 串口",
	"0403:6010": "FT2232 串口",
	"0403:6015": "FT231X 串口",
	"067B:2303": "PL2303 串口",
	"2341:0043": "Arduino Uno",
	"2341:0001": "Arduino",
	"303A:1001": "ESP32-S3",
	"303A:0002": "ESP32-S2",
	"0483:5740": "STM32 虚拟串口",
	"2E8A:0005": "Raspberry Pi Pico",
}

// getPortDescription returns a human-readable port name based on VID/PID.
func getPortDescription(vid, pid string) string {
	key := fmt.Sprintf("%s:%s", vid, pid)
	if name, ok := knownDevices[key]; ok {
		return name
	}
	return fmt.Sprintf("USB 串口 (VID:%s PID:%s)", vid, pid)
}

// Open opens a serial port with the given configuration.
func (m *Manager) Open(portName string, cfg types.OpenConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if already connected
	if m.currentPort != nil {
		return fmt.Errorf("端口已连接")
	}

	// Build serial mode
	mode := &serial.Mode{
		BaudRate: cfg.BaudRate,
	}

	// Data bits
	switch cfg.DataBits {
	case 7:
		mode.DataBits = 7
	case 8:
		mode.DataBits = 8
	default:
		mode.DataBits = 8
	}

	// Stop bits
	switch cfg.StopBits {
	case 1:
		mode.StopBits = serial.OneStopBit
	case 2:
		mode.StopBits = serial.TwoStopBits
	default:
		mode.StopBits = serial.OneStopBit
	}

	// Parity
	switch cfg.Parity {
	case "even":
		mode.Parity = serial.EvenParity
	case "odd":
		mode.Parity = serial.OddParity
	default:
		mode.Parity = serial.NoParity
	}

	// Flow control (handled via separate SetMode call if needed)
	// Note: go.bug.st/serial v1.6.0 handles flow control differently
	// Hardware flow control is enabled via RTS/CTS signals

	// Open the port
	port, err := serial.Open(portName, mode)
	if err != nil {
		// Map common errors
		errStr := err.Error()
		if strings.Contains(errStr, "Access denied") || strings.Contains(errStr, "Permission") {
			return fmt.Errorf("端口被占用或权限不足")
		}
		if strings.Contains(errStr, "not found") || strings.Contains(errStr, "不存在") {
			return fmt.Errorf("端口不存在")
		}
		return fmt.Errorf("打开端口失败: %w", err)
	}

	// Create port wrapper
	p := newPort(port, portName)
	
	// Set disconnect callback on the port
	m.mu.RLock()
	p.onDisconnect = m.onDisconnect
	m.mu.RUnlock()
	
	m.currentPort = p

	// Start read loop with data callback
	p.startReadLoop(func(data []byte) {
		m.mu.RLock()
		cb := m.onData
		m.mu.RUnlock()
		if cb != nil {
			cb("rx", data)
		}
	})

	return nil
}

// Close closes the current serial port.
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.currentPort == nil {
		return nil
	}

	err := m.currentPort.close()
	m.currentPort = nil
	return err
}

// IsOpen returns true if a port is currently open.
func (m *Manager) IsOpen() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentPort != nil && m.currentPort.isOpen()
}

// Write writes data to the current port.
func (m *Manager) Write(data []byte) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.currentPort == nil {
		return 0, fmt.Errorf("未连接串口")
	}

	n, err := m.currentPort.write(data)
	if err != nil {
		return 0, err
	}

	// Notify data callback for TX (already holding RLock, no need to re-acquire)
	if m.onData != nil && n > 0 {
		m.onData("tx", data[:n])
	}

	return n, nil
}

// SetSignals sets the RTS and DTR control signals.
func (m *Manager) SetSignals(rts, dtr bool) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.currentPort == nil {
		return fmt.Errorf("未连接串口")
	}

	return m.currentPort.setSignals(rts, dtr)
}

// GetSignals reads the current status of control signals.
func (m *Manager) GetSignals() (types.SignalsStatus, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.currentPort == nil {
		return types.SignalsStatus{}, fmt.Errorf("未连接串口")
	}

	return m.currentPort.getSignals()
}

// HexToBytes converts a hex string (e.g., "48 65 6C 6C 6F") to bytes.
func HexToBytes(hexStr string) ([]byte, error) {
	// Remove spaces and common separators
	hexStr = strings.ReplaceAll(hexStr, " ", "")
	hexStr = strings.ReplaceAll(hexStr, "-", "")
	hexStr = strings.ReplaceAll(hexStr, ":", "")
	hexStr = strings.ToUpper(hexStr)

	return hex.DecodeString(hexStr)
}

// BytesToHex converts bytes to a space-separated hex string.
func BytesToHex(data []byte) string {
	return strings.ToUpper(hex.EncodeToString(data))
}

const (
	// FrameMaxBytes is the maximum bytes before forcing a frame.
	FrameMaxBytes = 4096
	// FrameSilenceMs is the silence interval for frame detection.
	FrameSilenceMs = 30
)