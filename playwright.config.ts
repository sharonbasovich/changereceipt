import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.CHANGERECEIPT_PORT ?? '5173')
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('CHANGERECEIPT_PORT must be an integer from 1 to 65535')
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
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
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
