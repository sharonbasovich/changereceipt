import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'hosted' ? '/changereceipt/' : '/',
  build: { outDir: mode === 'hosted' ? 'dist-hosted' : 'dist' },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
  server: { host: '127.0.0.1' },
}))
