// Package static embeds the frontend build output.
package static

import "embed"

// Files contains the embedded frontend dist directory.
// The frontend must be built with `npm run build` before Go compilation.
// Static files should be copied to backend/internal/static/dist/
//
//go:embed dist/*
var Files embed.FS