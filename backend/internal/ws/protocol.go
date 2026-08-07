// Package ws defines WebSocket message protocol structures.
package ws

import "encoding/json"

// Command represents a request from the client.
type Command struct {
	Cmd     string          `json:"cmd"`
	Seq     int64           `json:"seq"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Response represents a reply to a command.
type Response struct {
	Cmd     string      `json:"cmd"`
	Seq     int64       `json:"seq"`
	Code    int         `json:"code"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// DataEvent represents an asynchronous data event pushed to the client.
type DataEvent struct {
	Event   string      `json:"event"`
	Payload DataPayload `json:"payload"`
}

// DataPayload contains the actual data in a DataEvent.
type DataPayload struct {
	Direction string `json:"direction"` // "tx" | "rx"
	Raw       string `json:"raw"`       // Base64 encoded bytes
	Hex       string `json:"hex"`       // Space-separated hex string
	Text      string `json:"text"`      // Decoded text
	Timestamp int64  `json:"timestamp"` // Unix milliseconds
	Encoding  string `json:"encoding"`  // "utf-8" | "gbk"
}

// ConnectPayload represents parameters for the 'connect' command.
type ConnectPayload struct {
	Port        string `json:"port"`
	BaudRate    int    `json:"baudRate"`
	DataBits    int    `json:"dataBits"`
	StopBits    int    `json:"stopBits"`
	Parity      string `json:"parity"`      // "none" | "even" | "odd"
	FlowControl string `json:"flowControl"` // "none" | "hardware"
}

// SendPayload represents parameters for the 'send' command.
type SendPayload struct {
	Mode       string `json:"mode"`       // "text" | "hex"
	Encoding   string `json:"encoding"`   // "utf-8" | "gbk"
	Data       string `json:"data"`       // Text or hex string
	AppendCRLF bool   `json:"appendCRLF"` // Whether to append line ending
}

// SetSignalsPayload represents parameters for the 'set_signals' command.
type SetSignalsPayload struct {
	RTS bool `json:"rts"` // Request To Send
	DTR bool `json:"dtr"` // Data Terminal Ready
}

// Response codes
const (
	CodeSuccess             = 0
	CodePortNotFound        = 1001
	CodePortBusy            = 1002
	CodeInvalidConfig       = 1003
	CodeNotConnected        = 1004
	CodeWriteFailed         = 1005
	CodeWsDisconnected      = 2001
	CodeInternalError       = 2002
	CodeUnsupportedCommand  = 2003
)

// ResponseMessages maps codes to human-readable messages.
var ResponseMessages = map[int]string{
	CodeSuccess:            "操作成功",
	CodePortNotFound:       "端口不存在",
	CodePortBusy:           "端口已被其他程序占用",
	CodeInvalidConfig:      "参数错误",
	CodeNotConnected:       "未连接串口",
	CodeWriteFailed:        "发送失败",
	CodeWsDisconnected:     "服务器连接断开",
	CodeInternalError:      "内部错误",
	CodeUnsupportedCommand: "不支持的命令",
}

// NewResponse creates a response with the standard message.
func NewResponse(cmd string, seq int64, code int, data interface{}) Response {
	msg, ok := ResponseMessages[code]
	if !ok {
		msg = "未知错误"
	}
	return Response{
		Cmd:     cmd,
		Seq:     seq,
		Code:    code,
		Message: msg,
		Data:    data,
	}
}

// NewErrorResponse creates an error response.
func NewErrorResponse(cmd string, seq int64, code int, customMsg string) Response {
	if customMsg != "" {
		return Response{
			Cmd:     cmd,
			Seq:     seq,
			Code:    code,
			Message: customMsg,
		}
	}
	return NewResponse(cmd, seq, code, nil)
}

// NewSuccessResponse creates a success response.
func NewSuccessResponse(cmd string, seq int64, data interface{}) Response {
	return Response{
		Cmd:  cmd,
		Seq:  seq,
		Code: CodeSuccess,
		Data: data,
	}
}