import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vitest 配置（独立于 vite.config.ts，避免污染生产构建配置）。
 *
 * - environment: jsdom —— 源码大量依赖 window / navigator / TextDecoder / localStorage；
 * - setupFiles: 统一注入 crypto.randomUUID、navigator.serial mock 等测试环境补丁；
 * - 只收集 src 下的 *.test.ts(x)，不进入 node_modules。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/utils/**', 'src/store/**', 'src/serial/**', 'src/hooks/**'],
    },
  },
});
