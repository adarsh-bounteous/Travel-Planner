import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { apiProxy } from './src/devProxy'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: apiProxy(process.env.API_ORIGIN ?? 'http://localhost:8000'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
