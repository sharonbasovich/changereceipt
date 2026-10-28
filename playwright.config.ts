import { defineConfig, devices } from '@playwright/test'

const mode = process.env.CHANGERECEIPT_SERVER_MODE ?? 'development'
if (mode !== 'development' && mode !== 'production')
  throw new Error('CHANGERECEIPT_SERVER_MODE must be development or production')
const production = mode === 'production'
const portText = process.env.CHANGERECEIPT_PORT ?? (production ? '4173' : '5173')
const port = Number(portText)
if (!/^[0-9]+$/.test(portText) || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('CHANGERECEIPT_PORT must be an integer from 1024 to 65535')
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  testMatch: 'workflow.spec.ts',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: production
      ? 'node server.mjs'
      : `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    env: { CHANGERECEIPT_PORT: String(port) },
    url: baseURL,
    reuseExistingServer: !production && !process.env.CI,
    timeout: 30_000,
  },
})
