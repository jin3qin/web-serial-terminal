import type { Config } from 'tailwindcss';

/**
 * Tailwind 配置。
 *
 * 关键约定（见系统设计 §8.7）：
 * - 必须关闭 preflight，否则会覆盖 MUI（Emotion）的基线样式；
 * - Tailwind 只负责布局（flex/grid/gap/padding），组件视觉一律交给 MUI 主题；
 * - 暗色模式使用 class 策略，由 MUI ThemeProvider 同步在 <html> 上加 `dark`。
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        mono: ['ui-monospace', 'Cascadia Code', 'Consolas', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
