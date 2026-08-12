import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';

/**
 * 获取版本号（优先从 Git Tag 获取）
 */
function getVersion(): string {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf-8' }).trim();
  } catch {
    return 'v1.0.0';
  }
}

const APP_VERSION = getVersion();

/**
 * Vite 配置。
 *
 * WebSocket 模式：开发时通过 proxy 代理到 Go 后端（localhost:8080）。
 * 生产模式下前端嵌入 Go 后端单文件 exe。
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: 'localhost',
    strictPort: false,
    // Proxy WebSocket requests to Go backend
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});