// Package main is the entry point for the serial debug tool backend.
package main

import (
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"

	"serial-debug-tool/internal/browser"
	"serial-debug-tool/internal/config"
	"serial-debug-tool/internal/static"
	"serial-debug-tool/internal/ws"
)

// Build-time variables (can be set via -ldflags)
var (
	Version   = "1.0.0"
	BuildTime = "unknown"
)

func main() {
	// Get executable path for config resolution
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("Failed to get executable path: %v", err)
	}

	// Load configuration
	cfgMgr := config.NewManager(exePath)
	if err := cfgMgr.Load(); err != nil {
		log.Printf("Warning: Failed to load config: %v, using defaults", err)
	}
	cfg := cfgMgr.Get()

	// Setup logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	if cfg.LogLevel == "DEBUG" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize WebSocket handler
	// Note: Each WebSocket session will create its own serial port manager
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

	// Find available port
	port := findAvailablePort(cfg.Port)
	if port != cfg.Port {
		log.Printf("Port %d busy, using port %d", cfg.Port, port)
		cfgMgr.SetPort(port)
	}

	// Start server
	serverAddr := fmt.Sprintf(":%d", port)

	// Display startup information
	fmt.Println()
	fmt.Println("╔════════════════════════════════════════════╗")
	fmt.Printf("║  Serial Debug Tool v%-16s       ║\n", Version)
	fmt.Println("╚════════════════════════════════════════════╝")
	fmt.Println()
	fmt.Printf("  🌐 Web Interface: http://localhost:%d\n", port)
	fmt.Println("  📝 Log file: See console output above")
	fmt.Println()
	fmt.Println("  💡 Tips:")
	fmt.Println("     • Browser should open automatically")
	fmt.Println("     • Press Ctrl+C to stop the server")
	fmt.Println("     • Close this window to exit")
	fmt.Println()
	fmt.Println("══════════════════════════════════════════════")
	fmt.Println()

	log.Printf("Server starting on http://localhost:%d", port)

	// Auto-open browser
	if cfg.AutoOpen {
		url := fmt.Sprintf("http://localhost:%d", port)
		go func() {
			// Wait a moment for server to start
			// In production, we'd check health endpoint
			if err := browser.OpenURL(url); err != nil {
				log.Printf("Failed to open browser: %v", err)
			}
		}()
	}

	// Graceful shutdown setup
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-quit
		fmt.Println()
		log.Printf("Received signal %v, shutting down...", sig)

		// Note: Each session manages its own serial port
		// No global manager to close

		// Save config
		if err := cfgMgr.Save(); err != nil {
			log.Printf("Error saving config: %v", err)
		}

		fmt.Println()
		fmt.Println("══════════════════════════════════════════════")
		fmt.Println("  Thank you for using Serial Debug Tool! 👋")
		fmt.Println("══════════════════════════════════════════════")
		fmt.Println()
		log.Println("Shutdown complete")
		os.Exit(0)
	}()

	// Start HTTP server
	if err := r.Run(serverAddr); err != nil {
		log.Fatalf("Server failed: %v", err)
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