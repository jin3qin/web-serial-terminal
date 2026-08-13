// Package main is the entry point for the serial debug tool backend.
package main

import (
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"web-serial-terminal/internal/browser"
	"web-serial-terminal/internal/config"
	"web-serial-terminal/internal/singleton"
	"web-serial-terminal/internal/static"
	"web-serial-terminal/internal/systray"
	"web-serial-terminal/internal/ws"
)

// Build-time variables (can be set via -ldflags)
var (
	Version   = "1.0.0"
	BuildTime = "unknown"
)

const AppName = "SerialDebugTool"

// Global log file for syncing
var logFile *os.File

func main() {
	// Setup log file first - write to executable directory
	exePath, err := os.Executable()
	if err != nil {
		showErrorDialog("启动错误", fmt.Sprintf("无法获取程序路径: %v", err))
		os.Exit(1)
	}

	// Create log file
	logPath := exePath + ".log"
	logFile, err = os.Create(logPath)
	if err != nil {
		showErrorDialog("日志错误", fmt.Sprintf("无法创建日志文件: %v", err))
	}

	// Write directly to file first to test
	if logFile != nil {
		logFile.WriteString("=== 直接写入测试 ===\n")
		logFile.Sync()
	}

	// Setup log output - NOTE: don't use MultiWriter with os.Stdout
	// because windowsgui mode has no console, os.Stdout is invalid
	if logFile != nil {
		log.SetOutput(logFile)
	}
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	log.Println("========================================")
	log.Printf("程序启动，版本: %s", Version)
	log.Printf("程序路径: %s", exePath)
	log.Printf("日志文件: %s", logPath)
	syncLog()

	// Check for single instance - if already running, just open browser
	if singleton.IsRunning(AppName) {
		log.Println("检测到已有实例运行，打开浏览器后退出")
		syncLog()
		cfgMgr := config.NewManager(exePath)
		_ = cfgMgr.Load()
		cfg := cfgMgr.Get()
		url := fmt.Sprintf("http://localhost:%d", cfg.Port)
		_ = browser.OpenURL(url)
		return
	}
	_ = singleton.CreateLockFile(AppName)
	log.Println("单例检测通过，继续启动...")
	syncLog()

	// Load configuration
	cfgMgr := config.NewManager(exePath)
	if err := cfgMgr.Load(); err != nil {
		log.Printf("警告: 加载配置失败: %v，使用默认值", err)
	}
	cfg := cfgMgr.Get()
	log.Printf("配置加载完成，端口: %d, 自动打开: %v", cfg.Port, cfg.AutoOpen)
	syncLog()

	// Setup logging level
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	if cfg.LogLevel == "DEBUG" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize WebSocket handler
	wsHandler := ws.NewHandler()

	// Setup Gin router
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())

	// Static file serving from embedded dist
	setupStaticRoutes(r)

	// WebSocket endpoint
	r.GET("/ws", wsHandler.HandleConnection)

	// Health check endpoint
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"version": Version,
		})
	})

	// Config endpoints
	r.GET("/api/config", func(c *gin.Context) {
		cfg := cfgMgr.Get()
		c.JSON(http.StatusOK, gin.H{
			"port":     cfg.Port,
			"autoOpen": cfg.AutoOpen,
		})
	})

	r.POST("/api/config", func(c *gin.Context) {
		var req struct {
			Port     *int  `json:"port"`
			AutoOpen *bool `json:"autoOpen"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		if req.Port != nil {
			if *req.Port < 1 || *req.Port > 65535 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "port must be between 1 and 65535"})
				return
			}
			cfgMgr.SetPort(*req.Port)
		}
		if req.AutoOpen != nil {
			cfgMgr.SetAutoOpen(*req.AutoOpen)
		}

		if err := cfgMgr.Save(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save config"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":     "配置已保存，重启后生效",
			"needRestart": true,
		})
	})

	// Find available port
	log.Printf("开始查找可用端口，配置端口: %d", cfg.Port)
	port := findAvailablePort(cfg.Port)
	if port != cfg.Port {
		log.Printf("端口 %d 被占用，使用端口 %d", cfg.Port, port)
		cfgMgr.SetPort(port)
	}
	log.Printf("使用端口: %d", port)

	// Start server
	serverAddr := fmt.Sprintf(":%d", port)
	log.Printf("准备启动服务器: %s", serverAddr)

	// Start HTTP server in a goroutine
	url := fmt.Sprintf("http://localhost:%d", port)
	go func() {
		log.Printf("启动 HTTP 服务器: %s", serverAddr)
		if err := r.Run(serverAddr); err != nil {
			errorMsg := fmt.Sprintf("服务器启动失败: %v\n\n端口号: %d\n\n请检查端口是否被占用或更改配置文件中的端口号。", err, port)
			log.Println(errorMsg)
			showErrorDialog("Web Serial Terminal - 启动错误", errorMsg)
			_ = singleton.RemoveLockFile(AppName)
			singleton.Release()
			os.Exit(1)
		}
	}()

	// Auto-open browser on first launch
	if cfg.AutoOpen {
		go func() {
			time.Sleep(500 * time.Millisecond)
			log.Println("自动打开浏览器...")
			_ = browser.OpenURL(url)
		}()
	}

	// Start tray icon (must run on main thread)
	log.Println("启动系统托盘...")
	syncLog()

	// Debug: write directly before systray
	if logFile != nil {
		logFile.WriteString("=== 即将启动 systray ===\n")
		logFile.Sync()
	}

	tray := systray.New(url, Version)

	// Debug: write after New
	if logFile != nil {
		logFile.WriteString("=== systray.New 完成 ===\n")
		logFile.Sync()
	}

	tray.Run()

	// Debug: write after Run returns
	if logFile != nil {
		logFile.WriteString("=== tray.Run 返回 ===\n")
		logFile.Sync()
	}

	// Tray quit - clean up and exit
	log.Println("托盘退出，清理资源...")
	_ = singleton.RemoveLockFile(AppName)
	singleton.Release()
	log.Println("程序退出")
	syncLog()
	closeLog()
}

func syncLog() {
	if logFile != nil {
		logFile.Sync()
	}
}

func closeLog() {
	if logFile != nil {
		logFile.Close()
	}
}

// setupStaticRoutes configures serving of embedded frontend files.
func setupStaticRoutes(r *gin.Engine) {
	// Serve index.html for root
	r.GET("/", func(c *gin.Context) {
		data, err := static.Files.ReadFile("dist/index.html")
		if err != nil {
			c.String(http.StatusInternalServerError, "Failed to load index.html")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	// Serve assets directory
	assetsFS, err := fs.Sub(static.Files, "dist/assets")
	if err != nil {
		log.Fatalf("Failed to create assets sub-filesystem: %v", err)
	}
	r.StaticFS("/assets", http.FS(assetsFS))

	// Serve favicon and other static files from dist root
	r.GET("/favicon.ico", func(c *gin.Context) {
		data, err := static.Files.ReadFile("dist/favicon.ico")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "image/x-icon", data)
	})

	// Serve vite.svg if exists
	r.GET("/vite.svg", func(c *gin.Context) {
		data, err := static.Files.ReadFile("dist/vite.svg")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "image/svg+xml", data)
	})

	// SPA fallback: serve index.html for any unmatched route (for client-side routing)
	r.NoRoute(func(c *gin.Context) {
		// Don't serve index.html for API routes or static assets
		path := c.Request.URL.Path
		if len(path) >= 4 && path[:4] == "/api" {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if len(path) >= 7 && path[:7] == "/assets" {
			c.Status(http.StatusNotFound)
			return
		}

		// Serve index.html for SPA routes (like /settings)
		data, err := static.Files.ReadFile("dist/index.html")
		if err != nil {
			c.String(http.StatusInternalServerError, "Failed to load index.html")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})
}

// corsMiddleware adds CORS headers for development.
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// findAvailablePort finds an available port starting from the given port.
func findAvailablePort(startPort int) int {
	for port := startPort; port < startPort+100; port++ {
		addr := fmt.Sprintf(":%d", port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			listener.Close()
			return port
		}
	}
	// Fallback to startPort if all attempts fail
	return startPort
}
