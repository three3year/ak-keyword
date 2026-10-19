import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 相對基底路徑:打包結果放到任何靜態主機(含 GitHub Pages 子路徑)都不必改設定
  base: './',
  plugins: [vue()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
