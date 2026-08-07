// Package config provides configuration management for the serial debug tool.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Config holds all runtime configuration.
type Config struct {
	Port         int    `json:"port"`
	LogLevel     string `json:"logLevel"`
	AutoOpen     bool   `json:"autoOpen"`
	LastPort     string `json:"lastPort,omitempty"`
	LastBaudRate int    `json:"lastBaudRate,omitempty"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		Port:     8080,
		LogLevel: "INFO",
		AutoOpen: true,
	}
}

// Manager handles configuration loading and persistence.
type Manager struct {
	mu       sync.RWMutex
	config   *Config
	filePath string
}

// NewManager creates a new configuration manager.
func NewManager(exePath string) *Manager {
	// Config file is placed alongside the executable
	configPath := filepath.Join(filepath.Dir(exePath), "config.json")
	return &Manager{
		config:   DefaultConfig(),
		filePath: configPath,
	}
}

// Load reads configuration from file, creating default if not exists.
func (m *Manager) Load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			// Use defaults, will be saved on first persist
			return nil
		}
		return fmt.Errorf("failed to read config file: %w", err)
	}

	var loaded Config
	if err := json.Unmarshal(data, &loaded); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}

	// Merge with defaults for missing fields
	if loaded.Port <= 0 {
		loaded.Port = m.config.Port
	}
	if loaded.LogLevel == "" {
		loaded.LogLevel = m.config.LogLevel
	}

	m.config = &loaded
	return nil
}

// Save persists the current configuration to file.
func (m *Manager) Save() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Ensure parent directory exists
	dir := filepath.Dir(m.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(m.config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(m.filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// Get returns the current configuration (read-only copy).
func (m *Manager) Get() Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return *m.config
}

// SetPort updates the port setting.
func (m *Manager) SetPort(port int) {
	m.mu.Lock()
	m.config.Port = port
	m.mu.Unlock()
}

// SetLastSerialConfig persists the last used serial port configuration.
func (m *Manager) SetLastSerialConfig(port string, baudRate int) {
	m.mu.Lock()
	m.config.LastPort = port
	m.config.LastBaudRate = baudRate
	m.mu.Unlock()
}