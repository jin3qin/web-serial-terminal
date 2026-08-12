.PHONY: build-windows build-linux build-all clean

VERSION := $(shell git describe --tags --always 2>/dev/null || echo "v1.0.0")

build-windows:
	cd backend && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-H windowsgui -s -w -X main.Version=$(VERSION)" -o ../dist/web-serial-terminal.exe .
	@echo "Windows build complete: dist/web-serial-terminal.exe"

build-linux:
	cd backend && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w -X main.Version=$(VERSION)" -o ../dist/web-serial-terminal .
	@echo "Linux build complete: dist/web-serial-terminal"

build-all: build-windows build-linux
	@echo "All builds complete"

clean:
	rm -rf dist/
	@echo "Cleaned dist directory"

dev:
	cd backend && go run .