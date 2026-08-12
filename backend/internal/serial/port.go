package serial

import (
	"bufio"
	"bytes"
	"io"
	"sync"
	"time"

	"go.bug.st/serial"
	"web-serial-terminal/internal/types"
)

// Port wraps a serial port with read loop and frame buffering.
type Port struct {
	port        serial.Port
	name        string
	mu          sync.Mutex
	closed      bool
	stopChan    chan struct{}
	onDisconnect func()

	// Frame buffering
	frameBuffer  bytes.Buffer
	frameTimer   *time.Timer
	frameMutex   sync.Mutex
	frameFlushed chan struct{}
}

// newPort creates a new Port wrapper.
func newPort(port serial.Port, name string) *Port {
	return &Port{
		port:         port,
		name:         name,
		stopChan:     make(chan struct{}),
		frameFlushed: make(chan struct{}, 1),
	}
}

// startReadLoop starts the background read loop.
// The callback is invoked for each complete frame (30ms silence or 4096 bytes).
// onDisconnect is called when the port is unexpectedly disconnected.
func (p *Port) startReadLoop(onFrame func([]byte)) {
	// Frame accumulation buffer
	var accum bytes.Buffer
	var lastByteTime time.Time
	var frameMutex sync.Mutex

	// Read buffer
	readChan := make(chan readResult, 1)

	// Consecutive error counter for disconnect detection
	consecutiveErrors := 0
	const maxConsecutiveErrors = 5
	
	// Store disconnect callback
	p.mu.Lock()
	var onDisconnect func()
	onDisconnect = p.onDisconnect
	p.mu.Unlock()

	// Start dedicated read goroutine
	go func() {
		reader := bufio.NewReader(p.port)
		for {
			select {
			case <-p.stopChan:
				return
			default:
				buf := make([]byte, 1024)
				p.port.SetReadTimeout(10 * time.Millisecond)
				n, err := reader.Read(buf)
				if n > 0 || err != nil {
					select {
					case readChan <- readResult{data: buf[:n], err: err}:
					case <-p.stopChan:
						return
					}
				}
			}
		}
	}()

	// Frame assembly goroutine
	go func() {
		defer func() {
			// Flush remaining data on exit
			frameMutex.Lock()
			if accum.Len() > 0 {
				data := make([]byte, accum.Len())
				copy(data, accum.Bytes())
				frameMutex.Unlock()
				onFrame(data)
			} else {
				frameMutex.Unlock()
			}
		}()

		ticker := time.NewTicker(FrameSilenceMs * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-p.stopChan:
				return
			case result := <-readChan:
				if len(result.data) > 0 {
					consecutiveErrors = 0 // Reset on successful read
					frameMutex.Lock()
					accum.Write(result.data)
					lastByteTime = time.Now()
					frameMutex.Unlock()

					// Force flush if exceeded max frame size
					frameMutex.Lock()
					if accum.Len() >= FrameMaxBytes {
						data := make([]byte, accum.Len())
						copy(data, accum.Bytes())
						accum.Reset()
						frameMutex.Unlock()
						onFrame(data)
					} else {
						frameMutex.Unlock()
					}
				}
				if result.err != nil {
					if result.err == io.EOF {
						return
					}
					// Check if closed intentionally
					p.mu.Lock()
					isClosed := p.closed
					p.mu.Unlock()
					if isClosed {
						return
					}

					// Count consecutive errors
					consecutiveErrors++
					if consecutiveErrors >= maxConsecutiveErrors {
						// Port is likely disconnected - trigger callback
						if onDisconnect != nil {
							onDisconnect()
						}
						return
					}
					// Port may have temporary issue - continue reading
					time.Sleep(100 * time.Millisecond)
				}
			case <-ticker.C:
				// Check if silence period elapsed
				frameMutex.Lock()
				shouldFlush := accum.Len() > 0 &&
					time.Since(lastByteTime) >= FrameSilenceMs*time.Millisecond
				if shouldFlush {
					data := make([]byte, accum.Len())
					copy(data, accum.Bytes())
					accum.Reset()
					frameMutex.Unlock()
					onFrame(data)
				} else {
					frameMutex.Unlock()
				}
			}
		}
	}()
}

// readResult holds the result of a read operation
type readResult struct {
	data []byte
	err  error
}

// write writes data to the port.
func (p *Port) write(data []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return 0, ErrPortClosed
	}

	return p.port.Write(data)
}

// close closes the port and stops the read loop.
func (p *Port) close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return nil
	}

	p.closed = true
	close(p.stopChan)
	return p.port.Close()
}

// isOpen returns true if the port is open.
func (p *Port) isOpen() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return !p.closed
}

// setSignals sets the RTS and DTR control signals.
func (p *Port) setSignals(rts, dtr bool) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return ErrPortClosed
	}

	// Set RTS signal
	if err := p.port.SetRTS(rts); err != nil {
		return err
	}

	// Set DTR signal
	if err := p.port.SetDTR(dtr); err != nil {
		return err
	}

	return nil
}

// getSignals reads the current state of control signals.
func (p *Port) getSignals() (types.SignalsStatus, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return types.SignalsStatus{}, ErrPortClosed
	}

	status, err := p.port.GetModemStatusBits()
	if err != nil {
		return types.SignalsStatus{}, err
	}

	// Note: ModemStatusBits contains CTS, DSR, DCD, RI (input signals)
	// RTS and DTR are output signals, use GetRTS/GetDTR if available
	return types.SignalsStatus{
		RTS: false, // Output signal - cannot read directly
		DTR: false, // Output signal - cannot read directly
		CTS: status.CTS,
		DSR: status.DSR,
		DCD: status.DCD,
		RI:  status.RI,
	}, nil
}

// ErrPortClosed is returned when operating on a closed port.
var ErrPortClosed = &PortError{Message: "端口已关闭"}

// PortError represents a port-related error.
type PortError struct {
	Message string
}

func (e *PortError) Error() string {
	return e.Message
}