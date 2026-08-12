// Package ws provides WebSocket handling for the serial debug tool.
package ws

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"web-serial-terminal/internal/serial"
	"web-serial-terminal/internal/types"
)

// Handler manages WebSocket connections and message routing.
type Handler struct {
	clients    map[*websocket.Conn]*Session
	mu         sync.RWMutex
	upgrader   websocket.Upgrader
	seqCounter int64
}

// SerialPortManager is the interface required by the WebSocket handler.
type SerialPortManager interface {
	ListPorts() ([]types.PortInfo, error)
	Open(portName string, cfg types.OpenConfig) error
	Close() error
	IsOpen() bool
	Write(data []byte) (int, error)
	SetSignals(rts, dtr bool) error
	GetSignals() (types.SignalsStatus, error)
}

// Session holds per-client state.
type Session struct {
	conn        *websocket.Conn
	sendQueue   chan interface{}
	lastActive  time.Time
	sendMutex   sync.Mutex

	// Session-specific serial port manager (each client has its own)
	portManager *serial.Manager
	portName    string
}

// NewHandler creates a new WebSocket handler.
func NewHandler() *Handler {
	return &Handler{
		clients: make(map[*websocket.Conn]*Session),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow all origins for local development
				return true
			},
		},
	}
}

// HandleConnection handles a WebSocket connection upgrade.
func (h *Handler) HandleConnection(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WS] Upgrade failed: %v", err)
		return
	}

	// Create session-specific serial port manager
	portMgr := serial.NewManager()

	session := &Session{
		conn:        conn,
		sendQueue:   make(chan interface{}, 100),
		lastActive:  time.Now(),
		portManager: portMgr,
	}

	// Set up data callback for this session
	portMgr.SetDataCallback(func(direction string, data []byte) {
		h.onSessionData(session, direction, data)
	})

	// Set up disconnect callback
	portMgr.SetDisconnectCallback(func() {
		h.onSessionDisconnect(session)
	})

	h.mu.Lock()
	h.clients[conn] = session
	h.mu.Unlock()

	log.Printf("[WS] Client connected, total: %d", len(h.clients))

	// Start send loop for this session
	go h.sendLoop(session)

	// Read loop (blocks until disconnect)
	h.readLoop(conn, session)

	// Cleanup on disconnect
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()

	// Close serial port if open
	if session.portManager != nil && session.portManager.IsOpen() {
		log.Printf("[WS] Closing serial port for disconnected client: %s", session.portName)
		session.portManager.Close()
	}

	conn.Close()

	log.Printf("[WS] Client disconnected, remaining: %d", len(h.clients))
}

// readLoop handles incoming messages from a client.
func (h *Handler) readLoop(conn *websocket.Conn, session *Session) {
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			return
		}

		session.lastActive = time.Now()
		h.handleMessage(conn, session, msg)
	}
}

// sendLoop handles outgoing messages to a client.
func (h *Handler) sendLoop(session *Session) {
	for msg := range session.sendQueue {
		session.sendMutex.Lock()
		err := session.conn.WriteJSON(msg)
		session.sendMutex.Unlock()
		if err != nil {
			log.Printf("[WS] Write error: %v", err)
			return
		}
	}
}

// handleMessage parses and routes a single message.
func (h *Handler) handleMessage(conn *websocket.Conn, session *Session, raw []byte) {
	var cmd Command
	if err := json.Unmarshal(raw, &cmd); err != nil {
		h.send(session, NewErrorResponse("", 0, CodeInternalError, "无效的JSON格式"))
		return
	}

	var resp Response
	switch cmd.Cmd {
	case "list_ports":
		resp = h.handleListPorts(cmd, session)
	case "connect":
		resp = h.handleConnect(cmd, session)
	case "disconnect":
		resp = h.handleDisconnect(cmd, session)
	case "send":
		resp = h.handleSend(cmd, session)
	case "set_signals":
		resp = h.handleSetSignals(cmd, session)
	case "get_signals":
		resp = h.handleGetSignals(cmd, session)
	case "ping":
		resp = h.handlePing(cmd)
	default:
		resp = NewErrorResponse(cmd.Cmd, cmd.Seq, CodeUnsupportedCommand, "")
	}

	h.send(session, resp)
}

// send sends a message to a session.
func (h *Handler) send(session *Session, msg interface{}) {
	select {
	case session.sendQueue <- msg:
	default:
		log.Printf("[WS] Send queue full, dropping message")
	}
}

// Note: Broadcast method removed - each session now has its own port manager
// and data is routed to specific sessions only

// handleListPorts handles the list_ports command.
func (h *Handler) handleListPorts(cmd Command, session *Session) Response {
	ports, err := session.portManager.ListPorts()
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInternalError, err.Error())
	}

	// Convert to response format
	type portData struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		VID         string `json:"vid,omitempty"`
		PID         string `json:"pid,omitempty"`
	}

	data := make([]portData, len(ports))
	for i, p := range ports {
		data[i] = portData{
			Name:        p.Name,
			Description: p.Description,
			VID:         p.VID,
			PID:         p.PID,
		}
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]interface{}{
		"ports": data,
	})
}

// handleConnect handles the connect command.
func (h *Handler) handleConnect(cmd Command, session *Session) Response {
	if session.portManager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "请先断开当前连接")
	}

	var payload ConnectPayload
	if len(cmd.Payload) > 0 {
		if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
			return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInvalidConfig, "参数格式错误")
		}
	}

	// Validate required fields
	if payload.Port == "" {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodePortNotFound, "未指定端口名称")
	}

	// Set defaults
	if payload.BaudRate <= 0 {
		payload.BaudRate = 115200
	}
	if payload.DataBits <= 0 {
		payload.DataBits = 8
	}
	if payload.StopBits <= 0 {
		payload.StopBits = 1
	}
	if payload.Parity == "" {
		payload.Parity = "none"
	}
	if payload.FlowControl == "" {
		payload.FlowControl = "none"
	}

	// Convert parity
	parity := payload.Parity
	if parity != "even" && parity != "odd" {
		parity = "none"
	}

	cfg := types.OpenConfig{
		BaudRate:    payload.BaudRate,
		DataBits:    payload.DataBits,
		StopBits:    payload.StopBits,
		Parity:      parity,
		FlowControl: payload.FlowControl,
	}

	err := session.portManager.Open(payload.Port, cfg)
	if err != nil {
		// Map error to appropriate error code
		errStr := err.Error()
		var errorCode int

		if strings.Contains(errStr, "不存在") || strings.Contains(errStr, "not found") {
			errorCode = CodePortNotFound
		} else if strings.Contains(errStr, "被占用") || strings.Contains(errStr, "权限") ||
			strings.Contains(errStr, "denied") || strings.Contains(errStr, "Permission") {
			errorCode = CodePortBusy
		} else {
			errorCode = CodeInvalidConfig
		}

		return NewErrorResponse(cmd.Cmd, cmd.Seq, errorCode, err.Error())
	}

	// Store port name in session
	session.portName = payload.Port

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]interface{}{
		"port":     payload.Port,
		"baudRate": payload.BaudRate,
	})
}

// handleDisconnect handles the disconnect command.
func (h *Handler) handleDisconnect(cmd Command, session *Session) Response {
	if !session.portManager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	err := session.portManager.Close()
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInternalError, err.Error())
	}

	session.portName = ""
	return NewSuccessResponse(cmd.Cmd, cmd.Seq, nil)
}

// handleSend handles the send command.
func (h *Handler) handleSend(cmd Command, session *Session) Response {
	if !session.portManager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	var payload SendPayload
	if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInvalidConfig, "参数格式错误")
	}

	var data []byte
	var err error

	if payload.Mode == "hex" {
		// Parse hex string (space-separated)
		data, err = parseHex(payload.Data)
	} else {
		// Text mode
		data = []byte(payload.Data)
	}

	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInvalidConfig, err.Error())
	}

	if len(data) == 0 {
		return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]int{"bytes": 0})
	}

	n, err := session.portManager.Write(data)
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeWriteFailed, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]int{"bytes": n})
}

// handleSetSignals handles the set_signals command.
func (h *Handler) handleSetSignals(cmd Command, session *Session) Response {
	if !session.portManager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	var payload SetSignalsPayload
	if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInvalidConfig, "参数格式错误")
	}

	err := session.portManager.SetSignals(payload.RTS, payload.DTR)
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeWriteFailed, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, nil)
}

// handleGetSignals handles the get_signals command.
func (h *Handler) handleGetSignals(cmd Command, session *Session) Response {
	if !session.portManager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	signals, err := session.portManager.GetSignals()
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInternalError, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, signals)
}

// OnData is no longer used (replaced by session-specific callbacks).
// Kept for backward compatibility but does nothing.
func (h *Handler) OnData(direction string, data []byte) {
	// This method is no longer used
	// Data routing is now handled by session-specific callbacks
}

// onSessionData handles data events for a specific session.
func (h *Handler) onSessionData(session *Session, direction string, data []byte) {
	now := time.Now().UnixMilli()

	hexStr := formatHex(data)
	text := string(data)
	rawB64 := base64.StdEncoding.EncodeToString(data)

	event := DataEvent{
		Event: "data",
		Payload: DataPayload{
			Direction: direction,
			Raw:       rawB64,
			Hex:       hexStr,
			Text:      text,
			Timestamp: now,
			Encoding:  "utf-8",
		},
	}

	// Send only to this session
	h.send(session, event)
}

// onSessionDisconnect handles unexpected disconnection for a specific session.
func (h *Handler) onSessionDisconnect(session *Session) {
	// Notify the client about the disconnection
	h.send(session, NewErrorResponse("", 0, CodeDeviceLost, "设备已断开连接"))
}

// parseHex converts a hex string to bytes.
func parseHex(hexStr string) ([]byte, error) {
	// Simple implementation: remove spaces and decode
	cleaned := ""
	for _, c := range hexStr {
		if (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f') {
			cleaned += string(c)
		}
	}

	if len(cleaned)%2 != 0 {
		return nil, fmt.Errorf("HEX 长度必须是偶数")
	}

	result := make([]byte, len(cleaned)/2)
	for i := 0; i < len(cleaned); i += 2 {
		b := (hexValue(cleaned[i]) << 4) | hexValue(cleaned[i+1])
		result[i/2] = b
	}

	return result, nil
}

// hexValue converts a hex character to its value.
func hexValue(c byte) byte {
	if c >= '0' && c <= '9' {
		return c - '0'
	}
	if c >= 'A' && c <= 'F' {
		return c - 'A' + 10
	}
	if c >= 'a' && c <= 'f' {
		return c - 'a' + 10
	}
	return 0
}

// formatHex formats bytes as space-separated hex string.
func formatHex(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	result := fmt.Sprintf("%02X", data[0])
	for i := 1; i < len(data); i++ {
		result += fmt.Sprintf(" %02X", data[i])
	}
	return result
}

// handlePing handles the ping command for heartbeat.
func (h *Handler) handlePing(cmd Command) Response {
	return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]int64{
		"ts": time.Now().UnixMilli(),
	})
}