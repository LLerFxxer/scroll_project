import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
