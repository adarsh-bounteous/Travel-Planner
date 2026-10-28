import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { apiProxy } from './src/devProxy'
import { notFoundStatusMiddleware } from './src/notFoundStatus'

// Dev and preview serve index.html for every path; this makes unknown pages answer 404.
function notFoundStatus(): Plugin {
  let outDir = 'dist'
  return {
    name: 'not-found-status',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      const source = resolve(server.config.root, 'index.html')
      server.middlewares.use(
        notFoundStatusMiddleware(async (url) =>
          server.transformIndexHtml(url, await readFile(source, 'utf8')),
        ),
      )
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        notFoundStatusMiddleware(() => readFile(resolve(outDir, 'index.html'), 'utf8')),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), notFoundStatus()],
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
