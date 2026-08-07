.PHONY: build-windows build-linux build-all clean

VERSION := $(shell git describe --tags --always 2>/dev/null || echo "v1.0.0")

build-windows:
	cd backend && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-H windowsgui -s -w -X main.Version=$(VERSION)" -o ../dist/serial-debug-tool.exe .
	@echo "Windows build complete: dist/serial-debug-tool.exe"

build-linux:
	cd backend && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w -X main.Version=$(VERSION)" -o ../dist/serial-debug-tool .
	@echo "Linux build complete: dist/serial-debug-tool"

build-all: build-windows build-linux
	@echo "All builds complete"

clean:
	rm -rf dist/
	@echo "Cleaned dist directory"

dev:
	cd backend && go run .