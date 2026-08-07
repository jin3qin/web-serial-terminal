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
	"serial-debug-tool/internal/types"
)

// Handler manages WebSocket connections and message routing.
type Handler struct {
	manager    SerialPortManager
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
}

// NewHandler creates a new WebSocket handler.
func NewHandler(manager SerialPortManager) *Handler {
	return &Handler{
		manager: manager,
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

	session := &Session{
		conn:       conn,
		sendQueue:  make(chan interface{}, 100),
		lastActive: time.Now(),
	}

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
		resp = h.handleListPorts(cmd)
	case "connect":
		resp = h.handleConnect(cmd)
	case "disconnect":
		resp = h.handleDisconnect(cmd)
	case "send":
		resp = h.handleSend(cmd)
	case "set_signals":
		resp = h.handleSetSignals(cmd)
	case "get_signals":
		resp = h.handleGetSignals(cmd)
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

// Broadcast sends a message to all connected clients.
func (h *Handler) Broadcast(msg interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, session := range h.clients {
		h.send(session, msg)
	}
}

// handleListPorts handles the list_ports command.
func (h *Handler) handleListPorts(cmd Command) Response {
	ports, err := h.manager.ListPorts()
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
func (h *Handler) handleConnect(cmd Command) Response {
	if h.manager.IsOpen() {
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

	err := h.manager.Open(payload.Port, cfg)
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

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]interface{}{
		"port":     payload.Port,
		"baudRate": payload.BaudRate,
	})
}

// handleDisconnect handles the disconnect command.
func (h *Handler) handleDisconnect(cmd Command) Response {
	if !h.manager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	err := h.manager.Close()
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInternalError, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, nil)
}

// handleSend handles the send command.
func (h *Handler) handleSend(cmd Command) Response {
	if !h.manager.IsOpen() {
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

	n, err := h.manager.Write(data)
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeWriteFailed, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, map[string]int{"bytes": n})
}

// handleSetSignals handles the set_signals command.
func (h *Handler) handleSetSignals(cmd Command) Response {
	if !h.manager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	var payload SetSignalsPayload
	if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInvalidConfig, "参数格式错误")
	}

	err := h.manager.SetSignals(payload.RTS, payload.DTR)
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeWriteFailed, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, nil)
}

// handleGetSignals handles the get_signals command.
func (h *Handler) handleGetSignals(cmd Command) Response {
	if !h.manager.IsOpen() {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeNotConnected, "未连接串口")
	}

	signals, err := h.manager.GetSignals()
	if err != nil {
		return NewErrorResponse(cmd.Cmd, cmd.Seq, CodeInternalError, err.Error())
	}

	return NewSuccessResponse(cmd.Cmd, cmd.Seq, signals)
}

// OnData is called by the serial manager when data is received/transmitted.
func (h *Handler) OnData(direction string, data []byte) {
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

	h.Broadcast(event)
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