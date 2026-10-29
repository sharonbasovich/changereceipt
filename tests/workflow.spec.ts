import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'

interface Receipt {
  format: string
  version: number
  sources: Record<
    'before' | 'after',
    {
      name: string
      rawText: string
      originalBase64: string
      sha256: string
      rows: { record: number; cells: (string | null)[] }[]
    }
  >
  mapping: {
    beforeKey: number
    afterKey: number
    fields: { label: string; before: number | null; after: number | null }[]
  }
  comparison: {
    complete: boolean
    summary: {
      added: number
      removed: number
      changed: number
      unchanged: number
      ambiguous: number
      invalidKey: number
    }
    entries: {
      kind: string
      key: string | null
      before: { record: number; cells: (string | null)[] }[]
      after: { record: number; cells: (string | null)[] }[]
      changes: { label: string; before: string | null; after: string | null }[]
    }[]
    warnings: string[]
  }
}
const basicBefore =
  'ID,Name,Count,Notes\r\n001,Blankets,8,"Clean, folded"\r\n002,Soap,3,\r\nDUP,Gloves,2,Box A\r\nDUP,Gloves,4,Box B\r\n003,Towels,6,\r\n,Unknown,1,No ID\r\n004,Buckets,1\r\n'
const basicAfter =
  'ID,Name,Count,Notes\r\n001,Blankets,7,"Clean, folded"\r\n002,Soap,3,\r\nDUP,Gloves,6,Combined\r\n005,Cups,4,New\r\n004,Buckets,1,\r\n'

async function upload(
  page: Page,
  side: 'before' | 'after',
  contents: string | Buffer,
  replace = false,
  filename = `${side}.csv`,
) {
  await page
    .getByLabel(`${replace ? 'Replace' : 'Choose'} ${side} CSV`, { exact: true })
    .setInputFiles({
      name: filename,
      mimeType: 'text/csv',
      buffer: typeof contents === 'string' ? Buffer.from(contents, 'utf8') : contents,
    })
}

async function enterMapping(page: Page, before = basicBefore, after = basicAfter) {
  await upload(page, 'before', before)
  await upload(page, 'after', after)
  await expect(page.getByRole('button', { name: 'Map columns', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Make the meaning explicit.' })).toBeVisible()
}

async function compare(page: Page, beforeKey = 'ID', afterKey = 'ID') {
  await page.getByLabel('Before ID column', { exact: true }).selectOption({ label: beforeKey })
  await page.getByLabel('After ID column', { exact: true }).selectOption({ label: afterKey })
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A record of the handoff.' })).toBeVisible()
}

async function downloadText(page: Page, name: string) {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Browser download did not expose a readable stream')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function receipt(page: Page): Promise<Receipt> {
  return JSON.parse(await downloadText(page, 'Download full receipt')) as Receipt
}

async function capture(page: Page, path: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('requires explicit IDs, then accounts for changes, duplicate groups, and incomplete source records', async ({
  page,
}) => {
  await enterMapping(page)
  await expect(page.getByLabel('Before ID column')).toHaveValue('')
  await expect(page.getByLabel('After ID column')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Compare snapshots', exact: true })).toBeDisabled()
  await compare(page)
  const result = await receipt(page)
  expect(result.comparison.summary).toEqual({
    added: 1,
    removed: 1,
    changed: 2,
    unchanged: 1,
    ambiguous: 1,
    invalidKey: 1,
  })
  expect(result.comparison.complete).toBe(false)
  const duplicate = result.comparison.entries.filter((entry) => entry.key === 'DUP')
  expect(duplicate).toHaveLength(1)
  expect(duplicate[0]).toMatchObject({
    kind: 'ambiguous',
    before: [{ record: 4 }, { record: 5 }],
    after: [{ record: 4 }],
    changes: [],
  })
  expect(result.comparison.entries.find((entry) => entry.key === '004')?.changes).toEqual([
    { label: 'Notes', before: null, after: '' },
  ])
  expect(result.comparison.entries.some((entry) => entry.key === '001')).toBe(true)
  expect(result.comparison.entries.some((entry) => entry.key === '1')).toBe(false)
  await page.locator('details.scope > summary').click()
  await expect(page.getByText(/duplicate ID group/i).first()).toBeVisible()
})

test('full receipt preserves exact UTF-8 bytes, record provenance, mapping, and deterministic output', async ({
  page,
}) => {
  const before =
    '\uFEFFID,Name,Notes\r\n0007,"Cups, blue","First line\r\nSecond line"\r\n0008,Soap,\r\n'
  const after =
    'ID,Name,Notes\r\n0007,"Cups, blue","First line\r\nSecond line"\r\n0008,Soap,Ready\r\n'
  await enterMapping(page, before, after)
  await compare(page)
  const first = await downloadText(page, 'Download full receipt')
  expect(await downloadText(page, 'Download full receipt')).toBe(first)
  const result = JSON.parse(first) as Receipt
  expect(result.format).toBe('ChangeReceipt')
  expect(result.version).toBe(1)
  expect(result.sources.before.rawText).toBe(before)
  expect(
    Buffer.from(result.sources.before.originalBase64, 'base64').equals(Buffer.from(before)),
  ).toBe(true)
  expect(result.sources.before.sha256).toBe(createHash('sha256').update(before).digest('hex'))
  expect(result.sources.before.rows[1].record).toBe(3)
  expect(result.sources.before.rows[0].cells[2]).toBe('First line\r\nSecond line')
  expect(result.mapping).toEqual({
    beforeKey: 0,
    afterKey: 0,
    fields: [
      { label: 'Name', before: 1, after: 1 },
      { label: 'Notes', before: 2, after: 2 },
    ],
  })
})

test('rejects malformed quoting and allows importing the same repaired filename', async ({
  page,
}) => {
  await upload(page, 'before', 'ID,Name\n001,"Unclosed\n', false, 'inventory.csv')
  await expect(page.getByRole('alert')).toContainText(/unclosed|quote|parse/i)
  await expect(page.getByRole('button', { name: 'Map columns', exact: true })).toBeDisabled()
  await upload(page, 'before', 'ID,Name\n001,Repaired\n', false, 'inventory.csv')
  await expect(page.getByText('inventory.csv', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await upload(page, 'after', 'ID,Name\n001,Repaired\n')
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await compare(page)
  expect((await receipt(page)).comparison.summary.unchanged).toBe(1)
})

test('rejects duplicate headers, invalid UTF-8, excess cells and oversized files with actionable errors', async ({
  page,
}) => {
  await upload(page, 'before', 'ID,Name,Name\n1,A,B\n')
  await expect(page.getByRole('alert')).toContainText(/unique|duplicate/i)
  await upload(page, 'before', Buffer.from([0x49, 0x44, 0x2c, 0x4e, 0x0a, 0x31, 0x2c, 0xff]))
  await expect(page.getByRole('alert')).toContainText('UTF-8')
  await upload(page, 'before', 'ID,Name\n1,A,Extra\n')
  await expect(page.getByRole('alert')).toContainText(/3 cells|header has 2/i)
  await upload(page, 'before', Buffer.alloc(2 * 1024 * 1024 + 1, 65))
  await expect(page.getByRole('alert')).toContainText('2 MiB')
  await expect(page.getByRole('button', { name: 'Map columns', exact: true })).toBeDisabled()
})

test('changed mappings invalidate results and ID changes clear dependent fields', async ({
  page,
}) => {
  await enterMapping(page, 'ID,Name,Count\n001,Blankets,8\n', 'ID,Name,Count\n001,Blankets,7\n')
  await compare(page)
  expect((await receipt(page)).comparison.summary.changed).toBe(1)
  await page.getByRole('button', { name: 'Edit mapping', exact: true }).click()
  await page.getByRole('button', { name: 'Remove field 2', exact: true }).click()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  const narrowed = await receipt(page)
  expect(narrowed.comparison.summary).toMatchObject({ changed: 0, unchanged: 1 })
  expect(narrowed.comparison.warnings.join(' ')).toContain('Count')
  await page.getByRole('button', { name: 'Edit mapping', exact: true }).click()
  await page.getByLabel('Before ID column', { exact: true }).selectOption({ label: 'Name' })
  await expect(page.getByLabel('Field 1 label', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compare snapshots', exact: true })).toBeDisabled()
})

test('invalid field mappings report a recoverable error instead of producing a receipt', async ({
  page,
}) => {
  await enterMapping(page, 'ID,Name\n001,Blanket\n', 'ID,Name\n001,Towel\n')
  await page.getByLabel('Before ID column').selectOption({ label: 'ID' })
  await page.getByLabel('After ID column').selectOption({ label: 'ID' })
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  await page.getByRole('button', { name: 'Add a field', exact: true }).click()
  await page.getByLabel('Field 2 before column', { exact: true }).selectOption({ label: 'Name' })
  await page.getByLabel('Field 2 after column', { exact: true }).selectOption({ label: 'Name' })
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/once|already|repeated|mapped/i)
  await expect(
    page.getByRole('button', { name: 'Download full receipt', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove field 2', exact: true }).click()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  expect((await receipt(page)).comparison.summary.changed).toBe(1)
})

test('replacing an imported source clears keys and cannot expose a stale comparison', async ({
  page,
}) => {
  await enterMapping(page)
  await compare(page)
  await page.getByRole('button', { name: /Your snapshots/i }).click()
  await upload(page, 'before', 'New ID,Name,Count\n007,Box,2\n', true)
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await expect(page.getByLabel('Before ID column')).toHaveValue('')
  await expect(page.getByLabel('After ID column')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Compare snapshots', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Download full receipt', exact: true }),
  ).toHaveCount(0)
})

test('rejected replacements preserve both original sources and require a fresh mapping', async ({
  page,
}) => {
  await enterMapping(page)
  await compare(page)
  const original = await receipt(page)
  await page.getByRole('button', { name: /Your snapshots/i }).click()
  for (const side of ['before', 'after'] as const) {
    await upload(page, side, 'ID,Name\n"unclosed', true, 'invalid.csv')
    await expect(page.getByRole('alert').last()).toContainText('Previous snapshot kept')
    await expect(page.getByText(`${side}.csv`, { exact: true })).toBeVisible()
    await expect(page.getByLabel(`Replace ${side} CSV`, { exact: true })).toBeAttached()
  }
  await expect(page.getByRole('button', { name: /Review & receipt/i })).toBeDisabled()
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await expect(page.getByLabel('Before ID column')).toHaveValue('')
  await expect(page.getByLabel('After ID column')).toHaveValue('')
  await compare(page)
  expect(await receipt(page)).toEqual(original)
})

test('canceling a replacement preserves exact evidence, returns focus, and ignores late reads', async ({
  page,
}) => {
  await enterMapping(page)
  await compare(page)
  const original = await receipt(page)
  await page.getByRole('button', { name: /Your snapshots/i }).click()
  await page.evaluate(() => {
    const arrayBuffer = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      const bytes = await arrayBuffer.call(this)
      if (this.name === 'pending.csv')
        await new Promise<void>((resolve) => {
          window.addEventListener('release-pending-read', () => resolve(), { once: true })
          window.dispatchEvent(new Event('pending-read-started'))
        })
      return bytes
    }
  })
  for (const side of ['before', 'after'] as const) {
    // Handshake before cancellation avoids relying on a timing delay.
    const started = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.addEventListener('pending-read-started', () => resolve(), { once: true })
        }),
    )
    await upload(page, side, 'ID,Name\nLATE,Not the original\n', true, 'pending.csv')
    await started
    await expect(page.getByRole('button', { name: 'Map columns', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: /Map the columns/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /Review & receipt/i })).toBeDisabled()
    await page.getByRole('button', { name: `Cancel ${side} import`, exact: true }).click()
    await expect(page.getByLabel(`Replace ${side} CSV`, { exact: true })).toBeFocused()
    await expect(page.getByText(/import canceled.*Previous snapshot kept/)).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('release-pending-read')))
    await expect(page.getByText(`${side}.csv`, { exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await compare(page)
  expect(await receipt(page)).toEqual(original)
})

test('cancel import and reset invalidate delayed reads and permit a clean new workflow', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const arrayBuffer = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      const bytes = await arrayBuffer.call(this)
      await new Promise((resolve) => setTimeout(resolve, 500))
      return bytes
    }
  })
  await page.reload()
  await upload(page, 'before', 'ID,Name\n1,Pending\n')
  await page.getByRole('button', { name: 'Cancel before import', exact: true }).click()
  await expect(page.getByText(/Before import canceled/i)).toBeVisible()
  await page.waitForTimeout(650)
  await expect(page.getByLabel('Choose before CSV', { exact: true })).toBeAttached()
  await expect(page.getByText('before.csv', { exact: true })).toHaveCount(0)
  await upload(page, 'after', 'ID,Name\n1,Pending\n')
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await page.waitForTimeout(650)
  await expect(page.getByLabel('Choose after CSV', { exact: true })).toBeAttached()
  await expect(page.getByText('after.csv', { exact: true })).toHaveCount(0)
  await enterMapping(page, 'ID,Name\n1,Ready\n', 'ID,Name\n1,Ready\n')
  await compare(page)
  expect((await receipt(page)).comparison.summary.unchanged).toBe(1)
})

test('a manual import takes precedence over a pending synthetic example request', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  await page.route('**/fixtures/handoff-*.csv', async (route) => {
    requests++
    await gate
    await route.fulfill({ contentType: 'text/csv', body: 'ID,Name\n001,Synthetic sample\n' })
  })
  await page.getByRole('button', { name: 'Load synthetic example', exact: true }).click()
  await expect.poll(() => requests).toBe(2)
  await upload(page, 'before', 'ID,Name\n007,Chosen manually\n', false, 'manual.csv')
  await expect(page.getByText('manual.csv', { exact: true })).toBeVisible()
  release()
  await page.waitForTimeout(250)
  await expect(page.getByText('manual.csv', { exact: true })).toBeVisible()
  await expect(page.getByText('handoff-before.csv', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Choose after CSV', { exact: true })).toBeAttached()
})

test('renders untrusted cell text safely and protects spreadsheet formula cells in CSV output', async ({
  page,
}) => {
  await page.evaluate(() => {
    ;(window as Window & { injected?: boolean }).injected = false
  })
  const before = 'ID,Name,Notes\n=1+1,Old,Plain\n'
  const after =
    'ID,Name,Notes\n=1+1,"<img src=x onerror=""window.injected=true"">","  =HYPERLINK(""https://example.invalid"")"\n'
  await enterMapping(page, before, after)
  await compare(page)
  const result = await receipt(page)
  expect(result.comparison.entries[0].key).toBe('=1+1')
  expect(result.comparison.entries[0].changes[0].after).toContain('<img')
  const row = page.locator('details').filter({ hasText: '=1+1' }).first()
  if (await row.count()) await row.locator('summary').click()
  await expect(
    page.getByText('<img src=x onerror="window.injected=true">', { exact: true }).first(),
  ).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { injected?: boolean }).injected)).toBe(
    false,
  )
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  const csv = await downloadText(page, 'Download CSV summary')
  expect(csv).toContain('"\'=1+1"')
  expect(csv).toContain('"\'  =HYPERLINK(')
})

test('supports explicit cross-name mapping and missing source columns', async ({ page }) => {
  await enterMapping(
    page,
    'Asset ID,Item,Note\n0001,Blanket,\n',
    'Inventory ID,Description\n0001,Blanket\n',
  )
  await page.getByLabel('Before ID column').selectOption({ label: 'Asset ID' })
  await page.getByLabel('After ID column').selectOption({ label: 'Inventory ID' })
  await page.getByRole('button', { name: 'Add a field', exact: true }).click()
  await page.getByLabel('Field 1 label', { exact: true }).fill('Item')
  await page.getByLabel('Field 1 before column', { exact: true }).selectOption({ label: 'Item' })
  await page
    .getByLabel('Field 1 after column', { exact: true })
    .selectOption({ label: 'Description' })
  await page.getByRole('button', { name: 'Add a field', exact: true }).click()
  await page.getByLabel('Field 2 label', { exact: true }).fill('Note')
  await page.getByLabel('Field 2 before column', { exact: true }).selectOption({ label: 'Note' })
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  const result = await receipt(page)
  expect(result.comparison.entries[0].changes).toEqual([{ label: 'Note', before: '', after: null }])
})

test('filters ambiguous IDs, searches source text, and pages bounded result rendering without losing exports', async ({
  page,
}) => {
  await enterMapping(page)
  await compare(page)
  await page.locator('.summary-item').filter({ hasText: 'Ambiguous IDs' }).click()
  await expect(page.locator('.entries > details')).toHaveCount(1)
  await expect(page.locator('.entries > details')).toContainText('DUP')
  await page.getByRole('button', { name: 'All results', exact: true }).click()
  await page.getByLabel('Search IDs and source values', { exact: true }).fill('Clean, folded')
  await expect(page.locator('.entries > details')).toHaveCount(1)
  await expect(page.locator('.entries > details')).toContainText('001')
  await page
    .getByLabel('Search IDs and source values', { exact: true })
    .fill('No such synthetic value')
  await expect(page.getByText(/No results match this filter/)).toBeVisible()
  expect((await receipt(page)).comparison.entries).toHaveLength(7)
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  const rows = Array.from(
    { length: 55 },
    (_, index) => `${String(index).padStart(3, '0')},Item ${index}`,
  ).join('\n')
  await enterMapping(page, `ID,Name\n${rows}\n`, `ID,Name\n${rows}\n`)
  await compare(page)
  await expect(page.locator('.entries > details')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('.entries > details')).toHaveCount(5)
  expect((await receipt(page)).comparison.entries).toHaveLength(55)
})

test('mobile workflow remains within viewport and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await enterMapping(page, 'ID,Name,Count\n001,Blankets,8\n', 'ID,Name,Count\n001,Blankets,7\n')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await compare(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const transitions = await page
    .locator('button')
    .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).transitionDuration))
  expect(
    transitions.every((value) =>
      value.split(',').every((duration) => parseFloat(duration) <= 0.01),
    ),
  ).toBe(true)
  await capture(page, 'tests/evidence/mobile-review.png')
})

test('large duplicate groups render source rows lazily with bounded pages while preserving every record', async ({
  page,
}) => {
  const header = ['ID', ...Array.from({ length: 63 }, (_, i) => `Field ${i}`)].join(',')
  const rows = Array.from({ length: 120 }, (_, i) =>
    ['DUP', String(i), ...Array.from({ length: 62 }, () => 'v')].join(','),
  ).join('\n')
  await enterMapping(page, `${header}\n${rows}\n`, `${header}\n${rows}\n`)
  await compare(page)
  const entry = page.locator('.entry')
  await expect(entry).toHaveCount(1)
  await expect(entry.locator('tbody tr')).toHaveCount(0)
  await entry.locator('summary').click()
  await expect(entry.locator('tbody tr')).toHaveCount(40)
  await expect(entry.locator('tbody td')).toHaveCount(2560)
  const beforeRecords = entry.getByRole('region', { name: /^Before source records/ })
  await expect(beforeRecords.locator('tbody tr').first().getByRole('rowheader')).toHaveText('2')
  await entry.getByRole('button', { name: 'Before records next page', exact: true }).click()
  await expect(beforeRecords.locator('tbody tr').first().getByRole('rowheader')).toHaveText('22')
  const result = await receipt(page)
  expect(result.comparison.entries[0].before).toHaveLength(120)
  expect(result.comparison.entries[0].after).toHaveLength(120)
  expect(result.sources.before.rows).toHaveLength(120)
})

test('long accepted header names stay within the mobile viewport in expanded scope', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const longHeader = 'UnbrokenHeader'.repeat(1000)
  await enterMapping(page, `${longHeader},Name\n001,Blanket\n`, `${longHeader},Name\n001,Towel\n`)
  await page.getByLabel('Before ID column', { exact: true }).selectOption('0')
  await page.getByLabel('After ID column', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  expect((await receipt(page)).sources.before.rawText).toContain(longHeader)
  await page.locator('details.scope > summary').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await capture(page, 'tests/evidence/mobile-long-header.png')
})

test('keyboard can navigate explicit mapping and review; primary states pass axe', async ({
  page,
}) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await enterMapping(page, 'ID,Name\n001,Blankets\n', 'ID,Name\n001,Towels\n')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  const beforeKey = page.getByLabel('Before ID column', { exact: true })
  await beforeKey.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await expect(beforeKey).toHaveValue('0')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('After ID column', { exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Map same-named fields', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'A record of the handoff.' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await capture(page, 'tests/evidence/desktop-review.png')
})

test('expanded results, comparison scope, and original evidence pass axe', async ({ page }) => {
  await enterMapping(page)
  await compare(page)
  for (const summary of await page.locator('.entry > summary').all()) await summary.click()
  await page.locator('details.scope > summary').click()
  for (const summary of await page.locator('.evidence-source > summary').all())
    await summary.click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('synthetic example loads only local assets and reset removes imported evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const external: string[] = []
  const localOrigin = new URL(page.url()).origin
  page.on('request', (request) => {
    if (!request.url().startsWith(localOrigin) && !request.url().startsWith('data:'))
      external.push(request.url())
  })
  await capture(page, 'docs/evidence/sources-desktop.png')
  await page.getByRole('button', { name: 'Load synthetic example', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Map columns', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Map columns', exact: true }).click()
  await page.getByLabel('Before ID column', { exact: true }).selectOption({ label: 'Asset ID' })
  await page.getByLabel('After ID column', { exact: true }).selectOption({ label: 'Inventory ID' })
  await page.getByRole('button', { name: 'Map same-named fields', exact: true }).click()
  await page.getByRole('button', { name: 'Add a field', exact: true }).click()
  await page.getByLabel('Field 3 label', { exact: true }).fill('Item')
  await page.getByLabel('Field 3 before column', { exact: true }).selectOption({ label: 'Item' })
  await page
    .getByLabel('Field 3 after column', { exact: true })
    .selectOption({ label: 'Description' })
  await page.getByRole('button', { name: 'Add a field', exact: true }).click()
  await page.getByLabel('Field 4 label', { exact: true }).fill('Location')
  await page
    .getByLabel('Field 4 before column', { exact: true })
    .selectOption({ label: 'Location' })
  await page.getByLabel('Field 4 after column', { exact: true }).selectOption({ label: 'Storage' })
  await capture(page, 'docs/evidence/mapping-desktop.png')
  await page.getByRole('button', { name: 'Compare snapshots', exact: true }).click()
  const result = await receipt(page)
  expect(result.sources.before.name).toBe('handoff-before.csv')
  expect(result.comparison.summary).toEqual({
    added: 1,
    removed: 1,
    changed: 2,
    unchanged: 2,
    ambiguous: 1,
    invalidKey: 2,
  })
  await page.locator('.entry').first().locator('summary').click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.locator('.entry').first().locator('summary').click()
  await capture(page, 'docs/evidence/review-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await capture(page, 'docs/evidence/review-mobile.png')
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Start with two snapshots.' })).toBeVisible()
  await expect(page.getByText('handoff-before.csv', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Map columns', exact: true })).toBeDisabled()
  expect(external).toEqual([])
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 })
})
