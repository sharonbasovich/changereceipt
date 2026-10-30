import { defineConfig } from '@playwright/test'
import standard from './playwright.config'

const portText = process.env.CHANGERECEIPT_HOSTED_PORT ?? '4186'
const port = Number(portText)
if (!/^[0-9]+$/.test(portText) || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('CHANGERECEIPT_HOSTED_PORT must be an integer from 1024 through 65535')
const baseURL = `http://127.0.0.1:${port}/changereceipt/`

export default defineConfig(standard, {
  testMatch: ['workflow.spec.ts', 'hosted.spec.ts'],
  outputDir: 'test-results/hosted',
  reporter: [
    ['list'],
    ['json', { outputFile: 'hosted-artifacts/browser-results.json' }],
    ['html', { outputFolder: 'playwright-report/hosted', open: 'never' }],
  ],
  use: { baseURL },
  webServer: {
    command: 'node scripts/serve-hosted.mjs',
    env: { CHANGERECEIPT_HOSTED_PORT: String(port) },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
