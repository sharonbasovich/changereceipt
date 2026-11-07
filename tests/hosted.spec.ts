import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'

type Receipt = {
  sources: Record<
    'before' | 'after',
    { name: string; rawText: string; originalBase64: string; sha256: string }
  >
  mapping: {
    beforeKey: number
    afterKey: number
    fields: { label: string; before: number; after: number }[]
  }
  comparison: {
    complete: boolean
    summary: Record<string, number>
    entries: {
      key: string | null
      kind: string
      before: unknown[]
      after: unknown[]
      changes: unknown[]
    }[]
  }
}
const demoButton = (page: Page) =>
  page.getByRole('button', { name: 'Load synthetic example', exact: true })
const mapButton = (page: Page) => page.getByRole('button', { name: 'Map columns', exact: true })

async function download(page: Page, name = 'Download full receipt') {
  const ready = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const stream = await (await ready).createReadStream()
  if (!stream) throw new Error('No download stream')
  const buffers: Buffer[] = []
  for await (const chunk of stream) buffers.push(Buffer.from(chunk))
  return Buffer.concat(buffers).toString('utf8')
}
async function receipt(page: Page): Promise<Receipt> {
  return JSON.parse(await download(page))
}
async function mapSynthetic(page: Page, keyboard = false) {
  await expect(mapButton(page)).toBeEnabled()
  await mapButton(page).click()
  await expect(page.getByLabel('Before ID column')).toHaveValue('')
  await expect(page.getByLabel('After ID column')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Compare snapshots', exact: true })).toBeDisabled()
  await page.getByLabel('Before ID column').selectOption({ label: 'Asset ID' })
  await page.getByLabel('After ID column').selectOption({ label: 'Inventory ID' })
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  for (const [i, label, before, after] of [
    [3, 'Item', 'Item', 'Description'],
    [4, 'Location', 'Location', 'Storage'],
  ] as const) {
    await page.getByRole('button', { name: 'Add a field', exact: true }).click()
    await page.getByLabel(`Field ${i} label`, { exact: true }).fill(label)
    await page
      .getByLabel(`Field ${i} before column`, { exact: true })
      .selectOption({ label: before })
    await page.getByLabel(`Field ${i} after column`, { exact: true }).selectOption({ label: after })
  }
  const compare = page.getByRole('button', { name: 'Compare snapshots', exact: true })
  if (keyboard) {
    await compare.focus()
    await page.keyboard.press('Enter')
  } else await compare.click()
  await expect(page.getByRole('heading', { name: 'A record of the handoff.' })).toBeVisible()
}
async function loadAndCompare(page: Page) {
  await demoButton(page).click()
  await mapSynthetic(page)
}
async function screenshot(page: Page, name: string) {
  await mkdir('docs/evidence/hosted', { recursive: true })
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({
    path: `docs/evidence/hosted/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('real production subpath loads fixtures, requires mapping, preserves evidence and exports receipt', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.getByRole('note', { name: 'Hosted demo privacy' })).toContainText(
    'request metadata',
  )
  await expect(page.getByRole('note')).toContainText('IP address')
  await expect(page.locator('.demo-strip')).toBeVisible()
  expect(
    await demoButton(page).evaluate(
      (el) =>
        el.getBoundingClientRect().top <
        document.querySelector('.source-grid')!.getBoundingClientRect().top,
    ),
  ).toBe(true)
  await screenshot(page, 'desktop-start')
  const fixtureResponses: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/fixtures/')) {
      expect(response.status()).toBe(200)
      fixtureResponses.push(new URL(response.url()).pathname)
    }
  })
  await loadAndCompare(page)
  expect(fixtureResponses.sort()).toEqual([
    '/changereceipt/fixtures/handoff-after.csv',
    '/changereceipt/fixtures/handoff-before.csv',
  ])
  const result = await receipt(page)
  expect(result.comparison.summary).toEqual({
    changed: 2,
    added: 1,
    removed: 1,
    unchanged: 2,
    ambiguous: 1,
    invalidKey: 2,
  })
  expect(result.comparison.complete).toBe(false)
  expect(result.mapping.fields).toHaveLength(4)
  const duplicate = result.comparison.entries.find((e) => e.key === '0006')!
  expect([
    duplicate.kind,
    duplicate.before.length,
    duplicate.after.length,
    duplicate.changes,
  ]).toEqual(['ambiguous', 2, 1, []])
  for (const side of ['before', 'after'] as const) {
    const bytes = await readFile(`public/fixtures/handoff-${side}.csv`)
    expect(Buffer.from(result.sources[side].originalBase64, 'base64')).toEqual(bytes)
    expect(result.sources[side].sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  }
  await page.getByLabel('Search IDs and source values').fill('0006')
  await page.locator('.entry > summary').click()
  await expect(page.getByText('2 before / 1 after records. No match chosen.')).toBeVisible()
  await expect(page.locator('.entry-body tbody tr')).toHaveCount(3)
  await page.locator('details.scope > summary').click()
  await page.locator('.evidence-source > summary').first().click()
  await expect(page.locator('.hash').first()).toHaveText(result.sources.before.sha256)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await screenshot(page, 'desktop-evidence')
  expect(await download(page, 'Download CSV summary')).toContain('ambiguous')
})

test('failed and canceled synthetic source replacements retain exact prior evidence and invalidate stale results', async ({
  page,
}) => {
  await loadAndCompare(page)
  const original = await receipt(page)
  await page.getByRole('button', { name: /Your snapshots/ }).click()
  await page.getByLabel('Replace before CSV', { exact: true }).setInputFiles({
    name: 'rejected-synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('ID,Name\n1,"unclosed'),
  })
  await expect(page.getByRole('alert')).toContainText('Previous snapshot kept')
  await expect(page.getByRole('button', { name: /Review & receipt/ })).toBeDisabled()
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this)
      if (this.name === 'delayed-synthetic.csv')
        await new Promise<void>((resolve) =>
          window.addEventListener('release-hosted-read', () => resolve(), { once: true }),
        )
      return bytes
    }
  })
  await page.getByLabel('Replace after CSV', { exact: true }).setInputFiles({
    name: 'delayed-synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('ID,Name\nLATE,Synthetic\n'),
  })
  const cancel = page.getByRole('button', { name: 'Cancel after import', exact: true })
  await expect(cancel).toBeVisible()
  await expect(mapButton(page)).toBeDisabled()
  await cancel.click()
  await expect(page.getByLabel('Replace after CSV', { exact: true })).toBeFocused()
  await page.evaluate(() => window.dispatchEvent(new Event('release-hosted-read')))
  await expect(page.getByText('handoff-after.csv', { exact: true })).toBeVisible()
  await mapSynthetic(page)
  expect(await receipt(page)).toEqual(original)
})

test('reset and reload clear source data, choices and receipt access without persistent session storage', async ({
  page,
  context,
}) => {
  await loadAndCompare(page)
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await expect(mapButton(page)).toBeDisabled()
  await expect(page.getByText('handoff-before.csv', { exact: true })).toHaveCount(0)
  await demoButton(page).click()
  await expect(mapButton(page)).toBeEnabled()
  await page.reload()
  await expect(mapButton(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: /Review & receipt/ })).toBeDisabled()
  await expect(page.getByText('handoff-before.csv', { exact: true })).toHaveCount(0)
  expect(await context.storageState()).toEqual({ cookies: [], origins: [] })
  expect(
    await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      cache: (await caches.keys()).length,
    })),
  ).toEqual({ local: 0, session: 0, databases: 0, workers: 0, cache: 0 })
})

test('fixture fetch failure is announced and a repeated load recovers without partial evidence', async ({
  page,
}) => {
  await page.route('**/changereceipt/fixtures/handoff-before.csv', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await demoButton(page).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Synthetic files could not be loaded' }),
  ).toBeVisible()
  await expect(mapButton(page)).toBeDisabled()
  await page.unroute('**/changereceipt/fixtures/handoff-before.csv')
  await loadAndCompare(page)
  expect((await receipt(page)).comparison.summary.ambiguous).toBe(1)
})

for (const failure of ['fetch', 'validation'] as const) {
  test(`failed example ${failure} keeps the existing snapshots, mapping and receipt`, async ({
    page,
  }) => {
    await loadAndCompare(page)
    const original = await receipt(page)
    await page.getByRole('button', { name: /Your snapshots/ }).click()
    await page.route('**/changereceipt/fixtures/handoff-after.csv', (route) =>
      route.fulfill({
        status: failure === 'fetch' ? 503 : 200,
        contentType: 'text/csv',
        body: failure === 'fetch' ? 'Unavailable' : 'ID,Name\n1,"unclosed',
      }),
    )
    await demoButton(page).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Previous workspace kept' }),
    ).toBeVisible()
    await expect(page.getByText('handoff-before.csv', { exact: true })).toBeVisible()
    await expect(page.getByText('handoff-after.csv', { exact: true })).toBeVisible()
    await expect(mapButton(page)).toBeEnabled()
    await page.getByRole('button', { name: /Map the columns/ }).click()
    await expect(page.getByLabel('Before ID column')).toHaveValue('0')
    await expect(page.getByLabel('After ID column')).toHaveValue('0')
    await expect(page.getByLabel('Field 3 label', { exact: true })).toHaveValue('Item')
    await page.getByRole('button', { name: /Review & receipt/ }).click()
    expect(await receipt(page)).toEqual(original)
  })
}

test('actual imports, comparison and downloads transmit no CSV text or filenames and use only static GET requests', async ({
  page,
  context,
}) => {
  const requests: {
    url: string
    method: string
    headers: Record<string, string>
    body: string | null
  }[] = []
  const sockets: string[] = []
  page.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() }),
  )
  page.on('websocket', (socket) => sockets.push(socket.url()))
  await page.reload()
  await demoButton(page).click()
  await expect(mapButton(page)).toBeEnabled()
  const needle = 'SYNTHETIC-NOT-TRANSMITTED-94a73'
  const filename = 'synthetic-evidence-not-uploaded.csv'
  for (const side of ['before', 'after'] as const)
    await page.getByLabel(`Replace ${side} CSV`, { exact: true }).setInputFiles({
      name: filename,
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `ID,Name,Notes\n0001,${needle},"<img src=https://example.invalid/${needle}>"\n`,
      ),
    })
  await mapButton(page).click()
  await page.getByLabel('Before ID column').selectOption({ label: 'ID' })
  await page.getByLabel('After ID column').selectOption({ label: 'ID' })
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  await page.locator('.entry > summary').click()
  const result = await receipt(page)
  expect(result.sources.before.rawText).toContain(needle)
  await download(page, 'Download CSV summary')
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  for (const r of requests) {
    const u = new URL(r.url)
    expect(u.origin).toBe(new URL(page.url()).origin)
    expect(u.pathname).toMatch(
      /^\/changereceipt\/(?:$|assets\/[^/]+\.(?:js|css)$|fixtures\/handoff-(?:before|after)\.csv$)/,
    )
    expect(u.search).toBe('')
    expect(r.method).toBe('GET')
    expect(r.body).toBeNull()
  }
  expect(JSON.stringify(requests)).not.toContain(needle)
  expect(JSON.stringify(requests)).not.toContain(filename)
  expect(sockets).toEqual([])
  expect(await context.storageState()).toEqual({ cookies: [], origins: [] })
})

test('mobile viewport and reduced-motion keyboard workflow expose the same real synthetic receipt', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await screenshot(page, 'mobile-start')
  const demoBounds = await demoButton(page).boundingBox()
  expect(demoBounds).not.toBeNull()
  expect(demoBounds!.y + demoBounds!.height).toBeLessThanOrEqual(844)
  await demoButton(page).focus()
  await page.keyboard.press('Enter')
  await mapSynthetic(page, true)
  await page.getByLabel('Search IDs and source values').fill('0002')
  const disclosure = page.locator('.entry > summary')
  await disclosure.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.changes-table')).toContainText('Count')
  expect((await receipt(page)).comparison.summary.changed).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    await page.locator('.step-content').evaluate((el) => ({
      animation: getComputedStyle(el).animationName,
      transition: getComputedStyle(el).transitionDuration,
    })),
  ).toEqual({ animation: 'none', transition: '0s' })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await screenshot(page, 'mobile-review')
})

test('strict static mount serves the artifact and rejects root fallbacks, source files and writes', async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin
  expect((await request.get(origin + '/')).status()).toBe(404)
  expect((await request.get(origin + '/fixtures/handoff-before.csv')).status()).toBe(404)
  expect((await request.get(origin + '/server.mjs')).status()).toBe(404)
  expect((await request.get(origin + '/changereceipt/src/App.tsx')).status()).toBe(404)
  const redirect = await request.get(origin + '/changereceipt', { maxRedirects: 0 })
  expect(redirect.status()).toBe(308)
  expect(redirect.headers().location).toBe('/changereceipt/')
  expect((await request.post(baseURL!, { data: 'synthetic request rejected' })).status()).toBe(405)
  const html = await (await request.get(baseURL!)).text()
  expect(html).toMatch(/src="\/changereceipt\/assets\//)
  expect(html).not.toMatch(/src="\/assets\//)
})
