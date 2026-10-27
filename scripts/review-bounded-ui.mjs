/* global Buffer, console, document, innerWidth, performance, process */
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

// Independent regression for advertised limits, not a benchmark or a physical-stock claim.
const baseURL = process.env.REVIEW_BASE_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
try {
  await page.goto(baseURL)
  const header = ['ID', ...Array.from({ length: 63 }, (_, i) => `Field${i + 1}`)].join(',')
  const row = ['DUP', ...Array(63).fill('v')].join(',')
  const text = `${header}\n${Array(10_000).fill(row).join('\n')}\n`
  assert.ok(Buffer.byteLength(text) < 2 * 1024 * 1024)
  for (const side of ['before', 'after']) {
    await page
      .getByLabel(`Choose ${side} CSV`, { exact: true })
      .setInputFiles({ name: `${side}.csv`, mimeType: 'text/csv', buffer: Buffer.from(text) })
  }
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await page.getByLabel('Before ID column', { exact: true }).selectOption('0')
  await page.getByLabel('After ID column', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  const start = performance.now()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  await page.getByRole('heading', { name: 'A record of the handoff.' }).waitFor()
  assert.equal(await page.locator('.entries > details').count(), 1)
  assert.equal(await page.locator('.entries tbody tr').count(), 0)
  const elapsed = Math.round(performance.now() - start)
  await page.locator('.entries > details > summary').click()
  await page.waitForFunction(() => document.querySelectorAll('.entries tbody tr').length === 40)
  assert.equal(await page.locator('.entries tbody tr').count(), 40)
  await page.getByRole('button', { name: 'Before records next page', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.entries .source-records tbody th')?.textContent === '22',
  )
  assert.equal(
    await page
      .locator('.entries .source-records')
      .first()
      .locator('tbody th')
      .first()
      .textContent(),
    '22',
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download full receipt', exact: true }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  assert.ok(stream)
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const receipt = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  assert.equal(receipt.comparison.entries[0].before.length, 10_000)
  assert.equal(receipt.comparison.entries[0].after.length, 10_000)
  assert.equal(receipt.sources.before.rawText, text)
  console.log(
    `PASS: 10000 records x 64 columns per source; closed evidence unmounted; opened evidence bounded to 20 records per side; all 20000 source records retained in receipt. Observed compare-to-review ${elapsed}ms in this run.`,
  )

  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const longKey = 'K'.repeat(20_000)
  const ignored = 'Ignored'.repeat(2_000)
  const longHeaderSource = `${longKey},Value,${ignored}\n001,same,preserved\n`
  for (const side of ['before', 'after']) {
    await page.getByLabel(`Choose ${side} CSV`, { exact: true }).setInputFiles({
      name: `${side}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(longHeaderSource),
    })
  }
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await page.getByLabel('Before ID column', { exact: true }).selectOption('0')
  await page.getByLabel('After ID column', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'Add a field', exact: true }).click()
  await page.getByLabel('Field 1 before column', { exact: true }).selectOption('1')
  await page.getByLabel('Field 1 after column', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  await page.locator('details.scope > summary').click()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  console.log(
    'PASS: 390px mobile viewport remains bounded with accepted 20000-character ID header and long unmapped-header warnings expanded.',
  )

  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 900 })
  const longId = '\u732b'.repeat(8_000)
  for (const [side, value] of [
    ['before', 'x'],
    ['after', 'y'],
  ]) {
    const largeChangeSource = `${header}\n${Array.from({ length: 30 }, (_, i) => [`${longId}${i}`, ...Array(63).fill(value)].join(',')).join('\n')}\n`
    assert.ok(Buffer.byteLength(largeChangeSource) < 2 * 1024 * 1024)
    await page.getByLabel(`Choose ${side} CSV`, { exact: true }).setInputFiles({
      name: `${side}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(largeChangeSource),
    })
  }
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await page.getByLabel('Before ID column', { exact: true }).selectOption('0')
  await page.getByLabel('After ID column', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  await page.getByRole('button', { name: 'Download CSV summary', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /16 MiB/)
  assert.match(await page.getByRole('alert').textContent(), /full JSON receipt/)
  const fallbackDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download full receipt', exact: true }).click()
  const fallbackDownload = await fallbackDownloadPromise
  const fallbackStream = await fallbackDownload.createReadStream()
  assert.ok(fallbackStream)
  const fallbackChunks = []
  for await (const chunk of fallbackStream) fallbackChunks.push(Buffer.from(chunk))
  const fallbackReceipt = JSON.parse(Buffer.concat(fallbackChunks).toString('utf8'))
  assert.equal(fallbackReceipt.comparison.summary.changed, 30)
  assert.equal(fallbackReceipt.sources.before.rows.length, 30)
  assert.deepEqual(pageErrors, [])
  console.log(
    'PASS: valid long-Unicode IDs trigger the 16 MiB CSV ceiling with an accessible error; full JSON receipt remains downloadable with all 30 changed records; no browser page errors.',
  )

  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  const manyLongHeaders = Array.from(
    { length: 64 },
    (_, i) => `H${String(i).padStart(2, '0')}_${'a'.repeat(19_996)}`,
  )
  const manyLongSource = `${manyLongHeaders.join(',')}\n${Array(64).fill('x').join(',')}\n`
  assert.ok(Buffer.byteLength(manyLongSource) < 2 * 1024 * 1024)
  for (const side of ['before', 'after']) {
    await page.getByLabel(`Choose ${side} CSV`, { exact: true }).setInputFiles({
      name: `${side}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(manyLongSource),
    })
  }
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await page.getByLabel('Before ID column', { exact: true }).selectOption('0')
  await page.getByLabel('After ID column', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  assert.equal(await page.locator('select').count(), 128)
  const optionLengths = await page
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.textContent.length))
  assert.ok(Math.max(...optionLengths) <= 120)
  assert.ok(optionLengths.reduce((total, length) => total + length, 0) < 1_000_000)
  assert.equal(
    await page.getByLabel('Field 1 label', { exact: true }).inputValue(),
    manyLongHeaders[1],
  )
  assert.deepEqual(pageErrors, [])
  console.log(
    'PASS: 64 accepted 20000-character headers produce 128 mapping selects with bounded option text; full original header remains the receipt label; no browser page errors.',
  )
} finally {
  await browser.close()
}
