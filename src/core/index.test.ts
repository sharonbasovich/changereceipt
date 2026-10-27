import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import {
  compareSnapshots,
  createReceipt,
  CSV_EXPORT_MAX_BYTES,
  CsvImportError,
  importSnapshot,
  LIMITS,
  receiptCsv,
  validateMapping,
} from './index'
import type { Mapping, Snapshot } from './index'

const bytes = (text: string) => new TextEncoder().encode(text)
const load = (text: string, name = 'inventory.csv') => importSnapshot(name, bytes(text))
const mapping: Mapping = {
  beforeKey: 0,
  afterKey: 0,
  fields: [
    { label: 'Item', before: 1, after: 1 },
    { label: 'Quantity', before: 2, after: 2 },
  ],
}
const smallMapping: Mapping = {
  beforeKey: 0,
  afterKey: 0,
  fields: [{ label: 'Value', before: 1, after: 1 }],
}

describe('CSV evidence import', () => {
  it('preserves quoted commas, doubled quotes, Unicode and exact multiline values', async () => {
    const source =
      'ID,Item,Quantity\r\n001,"First aid, large",05\r\n002,"The ""bright"" tent\r\nwith poles",2\r\n003,Café kit,1\r\n'
    const snapshot = await load(source)
    expect(snapshot.rows).toEqual([
      { record: 2, cells: ['001', 'First aid, large', '05'] },
      { record: 3, cells: ['002', 'The "bright" tent\r\nwith poles', '2'] },
      { record: 4, cells: ['003', 'Café kit', '1'] },
    ])
    expect(snapshot.rawText).toBe(source)
    expect(atob(snapshot.originalBase64)).toBe(
      Array.from(bytes(source), (value) => String.fromCharCode(value)).join(''),
    )
    expect(snapshot.byteLength).toBe(bytes(source).length)
    expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('has a verifiable SHA-256 fingerprint of original bytes', async () => {
    const snapshot = await load('abc')
    expect(snapshot.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('owns the supplied bytes while fingerprinting so a repeated import cannot replace evidence', async () => {
    const input = bytes('ID,Value\n001,Tent')
    const pending = importSnapshot('original.csv', input)
    input.fill(0)
    const snapshot = await pending
    expect(snapshot.rawText).toBe('ID,Value\n001,Tent')
    expect(atob(snapshot.originalBase64)).toBe('ID,Value\n001,Tent')
    expect(snapshot.sha256).toBe((await load(snapshot.rawText)).sha256)
  })

  it('preserves an optional UTF-8 BOM as evidence but excludes it from the header name', async () => {
    const snapshot = await load('\uFEFFID,Value\n001,yes')
    expect(snapshot.headers).toEqual(['ID', 'Value'])
    expect(snapshot.rawText.charCodeAt(0)).toBe(0xfeff)
    expect(atob(snapshot.originalBase64).slice(0, 3)).toBe('\xEF\xBB\xBF')
  })

  it('preserves untrusted HTML and formula-looking source text as plain data', async () => {
    const snapshot = await load('ID,Value\n001,<img src=x onerror=alert(1)>\n002,=SUM(A1:A2)')
    expect(snapshot.rows[0].cells[1]).toBe('<img src=x onerror=alert(1)>')
    expect(snapshot.rows[1].cells[1]).toBe('=SUM(A1:A2)')
  })

  it('handles mixed record separators without changing newlines inside a cell', async () => {
    const snapshot = await load('ID,Value\r001,"a\r\nb"\n002,two\r\n003,three')
    expect(snapshot.rows.map((row) => row.cells)).toEqual([
      ['001', 'a\r\nb'],
      ['002', 'two'],
      ['003', 'three'],
    ])
  })

  it('distinguishes empty cells from short, missing cells and preserves blank data records', async () => {
    const snapshot = await load('ID,Item,Quantity\n001,,\n002,Tent\n\n003,Rope,2\n')
    expect(snapshot.rows).toEqual([
      { record: 2, cells: ['001', '', ''] },
      { record: 3, cells: ['002', 'Tent', null] },
      { record: 4, cells: ['', null, null] },
      { record: 5, cells: ['003', 'Rope', '2'] },
    ])
    expect(snapshot.warnings[0]).toContain('2 data records')
  })

  it('ignores only the blank record created by a trailing separator', async () => {
    expect((await load('ID\n')).rows).toEqual([])
    expect((await load('ID\n\n')).rows).toEqual([{ record: 2, cells: [''] }])
    expect((await load('ID\n""')).rows).toEqual([{ record: 2, cells: [''] }])
    expect((await load('ID\n""\n')).rows).toEqual([{ record: 2, cells: [''] }])
  })

  it.each([
    ['ID,Value\n1,"unfinished', /Unclosed quoted field/],
    ['ID,Value\n1,un"quoted', /Unexpected quote/],
    ['ID,Value\n1,"done"extra', /Unexpected text after a closing quote/],
    ['ID,Value\n1,"done" ', /Unexpected text after a closing quote/],
    ['ID,Value\n1,"a""', /Unclosed quoted field/],
    ['ID,Value\n1,a,b', /has 3 cells/],
    ['ID,ID\n1,2', /Column names must be unique/],
    ['ID, \n1,2', /Every column needs/],
    ['\n1,2', /first record must contain column names/],
  ])('rejects malformed or structurally ambiguous input %j', async (source, message) => {
    await expect(load(source)).rejects.toThrow(message)
  })

  it('rejects invalid UTF-8, UTF-16-like NUL data, empty files and BOM-only files', async () => {
    await expect(importSnapshot('bad.csv', new Uint8Array([0xc3, 0x28]))).rejects.toMatchObject({
      code: 'encoding',
    })
    await expect(load('I\0D\0,\0V\0')).rejects.toMatchObject({ code: 'encoding' })
    await expect(load('')).rejects.toMatchObject({ code: 'empty-file' })
    await expect(load('\uFEFF')).rejects.toMatchObject({ code: 'empty-file' })
    await expect(load('')).rejects.toBeInstanceOf(CsvImportError)
  })

  it('enforces byte, row, column and decoded cell limits', async () => {
    await expect(
      importSnapshot('large.csv', new Uint8Array(LIMITS.maxBytes + 1)),
    ).rejects.toMatchObject({ code: 'byte-limit' })
    const columns = Array.from({ length: LIMITS.maxColumns + 1 }, (_, i) => `Column${i}`).join(',')
    await expect(load(columns)).rejects.toMatchObject({ code: 'column-limit' })
    await expect(load(`ID,Value\n1,${'x'.repeat(LIMITS.maxCellChars + 1)}`)).rejects.toMatchObject({
      code: 'cell-limit',
    })
    const exactlyFull = `ID,Value\n${Array.from({ length: LIMITS.maxRows }, (_, i) => `${i},x`).join('\n')}\n`
    expect((await load(exactlyFull)).rows).toHaveLength(LIMITS.maxRows)
    await expect(load(`${exactlyFull}last,x\n`)).rejects.toMatchObject({ code: 'row-limit' })
    await expect(load(`${exactlyFull}last,x`)).rejects.toMatchObject({ code: 'row-limit' })
  })
})

describe('explicit mapping and deterministic comparison', () => {
  it('classifies additions, removals, changes and unchanged IDs exactly', async () => {
    const before = await load(
      'ID,Item,Quantity\n001,Tent,2\n002,Rope,04\n003,Stove,1\n004,First aid,1',
    )
    const after = await load(
      'ID,Item,Quantity\n004,First aid,1\n003,Stove,2\n001,Tent,2\n005,Mat,3',
    )
    const result = compareSnapshots(before, after, mapping)
    expect(result.summary).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 2,
      ambiguous: 0,
      invalidKey: 0,
    })
    expect(result.entries.map((entry) => entry.key)).toEqual(['001', '002', '003', '004', '005'])
    expect(result.entries.find((entry) => entry.key === '003')?.changes).toEqual([
      { label: 'Quantity', before: '1', after: '2' },
    ])
    expect(result.complete).toBe(true)
  })

  it('keeps leading zero, whitespace, case, punctuation and prototype-looking IDs exact', async () => {
    const ids = ['001', '1', ' A', 'A', 'a', '__proto__', 'constructor', '=1+1']
    const source = `ID,Value\n${ids.map((id) => `${id},yes`).join('\n')}`
    const before = await load(source)
    const after = await load(source)
    const result = compareSnapshots(before, after, smallMapping)
    expect(result.summary.unchanged).toBe(ids.length)
    expect(result.summary.ambiguous).toBe(0)
    expect(result.warnings).toContain(
      'Some IDs contain surrounding whitespace. IDs are compared exactly; whitespace is not removed.',
    )
  })

  it('quarantines a duplicate group on either side, including identical duplicates and unmatched duplicates', async () => {
    const before = await load(
      'ID,Value\n001,Tent\n001,Tent\n002,Rope\n003,Stove\n003,Stove\n004,Lamp',
    )
    const after = await load('ID,Value\n001,Tent\n002,Rope\n002,Rope\n005,Mat\n005,Mat\n004,Lamp')
    const result = compareSnapshots(before, after, smallMapping)
    expect(result.summary).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 1,
      ambiguous: 4,
      invalidKey: 0,
    })
    expect(result.entries.find((entry) => entry.key === '001')).toMatchObject({
      kind: 'ambiguous',
      before: [{ record: 2 }, { record: 3 }],
      after: [{ record: 2 }],
      changes: [],
    })
    expect(result.complete).toBe(false)
    expect(result.warnings.join(' ')).toContain('All rows sharing those IDs are excluded')
  })

  it('never matches empty or missing IDs, and counts each invalid source row', async () => {
    const before = await load('Value,ID\nTent,\nStove\nLamp,ok')
    const after = await load('Value,ID\nTent,\nStove\nLamp,ok')
    const result = compareSnapshots(before, after, {
      beforeKey: 1,
      afterKey: 1,
      fields: [{ label: 'Value', before: 0, after: 0 }],
    })
    expect(result.summary).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 1,
      ambiguous: 0,
      invalidKey: 4,
    })
    expect(
      result.entries.filter((entry) => entry.kind === 'invalid-key').map((entry) => entry.key),
    ).toEqual(['', null, '', null])
    expect(result.complete).toBe(false)
  })

  it('reports missing-versus-empty changes and incomplete input', async () => {
    const before = await load('ID,Item,Quantity\n001,Tent')
    const after = await load('ID,Item,Quantity\n001,Tent,')
    const result = compareSnapshots(before, after, mapping)
    expect(result.entries[0].changes).toEqual([{ label: 'Quantity', before: null, after: '' }])
    expect(result.complete).toBe(false)
  })

  it('compares quantity-like text without numeric conversion or invented totals', async () => {
    const before = await load('ID,Item,Quantity\n001,Tent,04\n002,Mat,1.0')
    const after = await load('ID,Item,Quantity\n001,Tent,4\n002,Mat,1')
    const result = compareSnapshots(before, after, mapping)
    expect(result.summary.changed).toBe(2)
    expect(result.entries.map((entry) => entry.changes[0])).toEqual([
      { label: 'Quantity', before: '04', after: '4' },
      { label: 'Quantity', before: '1.0', after: '1' },
    ])
    expect(result).not.toHaveProperty('total')
  })

  it('maps different column names and explicit absent-side columns without guessing', async () => {
    const before = await load('Asset,Count,Old notes\n001,2,boxed')
    const after = await load('Pieces,Inventory ID,New notes\n2,001,')
    const result = compareSnapshots(before, after, {
      beforeKey: 0,
      afterKey: 1,
      fields: [
        { label: 'Quantity', before: 1, after: 0 },
        { label: 'Notes', before: null, after: 2 },
      ],
    })
    expect(result.entries[0].changes).toEqual([{ label: 'Notes', before: null, after: '' }])
    expect(result.warnings.join(' ')).toContain('Old notes')
    expect(result.complete).toBe(true)
  })

  it('reports columns outside scope and changes classification when the user changes mapping', async () => {
    const before = await load('ID,Item,Quantity\n001,Tent,2')
    const after = await load('ID,Item,Quantity\n001,Tent,3')
    const itemOnly: Mapping = {
      beforeKey: 0,
      afterKey: 0,
      fields: [{ label: 'Item', before: 1, after: 1 }],
    }
    expect(compareSnapshots(before, after, itemOnly).summary.unchanged).toBe(1)
    expect(compareSnapshots(before, after, itemOnly).warnings.join(' ')).toContain(
      'outside the comparison: Quantity',
    )
    expect(compareSnapshots(before, after, mapping).summary.changed).toBe(1)
  })

  it('supports a valid header-only snapshot as an empty source', async () => {
    const before = await load('ID,Value\n')
    const after = await load('ID,Value\n001,Tent')
    expect(compareSnapshots(before, after, smallMapping).summary.added).toBe(1)
  })

  it('rejects omitted, invalid, repeated or empty mapping choices', async () => {
    const source = await load('ID,Item,Quantity\n001,Tent,1')
    const invalid = [
      { ...mapping, beforeKey: -1 },
      { ...mapping, afterKey: 10 },
      { ...mapping, beforeKey: 0.5 },
      { ...mapping, beforeKey: null },
      { ...mapping, fields: [] },
      { ...mapping, fields: [{ label: ' ', before: 1, after: 1 }] },
      { ...mapping, fields: [{ label: 'Item', before: 0, after: 1 }] },
      { ...mapping, fields: [{ label: 'Item', before: null, after: null }] },
      {
        ...mapping,
        fields: [
          { label: 'Item', before: 1, after: 1 },
          { label: 'Item', before: 2, after: 2 },
        ],
      },
      {
        ...mapping,
        fields: [
          { label: 'Item', before: 1, after: 1 },
          { label: 'Other', before: 1, after: 2 },
        ],
      },
      {
        ...mapping,
        fields: [
          { label: 'Item', before: 1, after: 1 },
          { label: 'Other', before: 2, after: 1 },
        ],
      },
      { ...mapping, fields: [{ label: 'Item', before: 99, after: 1 }] },
    ]
    for (const candidate of invalid)
      expect(() => validateMapping(source, source, candidate as Mapping)).toThrow()
  })

  it('does not mutate evidence and is deterministic across repeated comparisons', async () => {
    const before = await load('ID,Value\nz,Tent\na,Rope\na,Rope\n,none')
    const after = await load('ID,Value\nb,Stove\nz,Tent')
    const evidence = JSON.stringify({ before, after, smallMapping })
    const first = compareSnapshots(before, after, smallMapping)
    expect(compareSnapshots(before, after, smallMapping)).toEqual(first)
    expect(JSON.stringify({ before, after, smallMapping })).toBe(evidence)
    expect(first.entries.map((entry) => entry.key)).toEqual(['a', 'b', 'z', ''])
  })
})

describe('exportable receipts', () => {
  let before: Snapshot
  let after: Snapshot
  const prepare = async () => {
    before = await load('ID,Value\n001,Tent\n002,Rope')
    after = await load('ID,Value\n001,Tent\n002,Stove')
    return compareSnapshots(before, after, smallMapping)
  }

  it('contains byte evidence, mapping, exact changes, scope and honest provenance rules', async () => {
    const result = await prepare()
    const receipt = createReceipt(before, after, smallMapping, result)
    expect(receipt.format).toBe('ChangeReceipt')
    expect(receipt.sources.before.originalBase64).toBe(before.originalBase64)
    expect(receipt.mapping).toEqual(smallMapping)
    expect(receipt.comparison.entries[1].changes).toEqual([
      { label: 'Value', before: 'Rope', after: 'Stove' },
    ])
    expect(receipt.rules.scope).toContain('no totals')
    expect(receipt.rules.evidence).toContain('do not authenticate')
    expect(JSON.stringify(createReceipt(before, after, smallMapping, result))).toBe(
      JSON.stringify(receipt),
    )
    receipt.sources.before.rows[0].cells[0] = 'mutated'
    expect(before.rows[0].cells[0]).toBe('001')
  })

  it('refuses a stale result after a mapping or source change', async () => {
    const result = await prepare()
    result.summary.changed = 900
    expect(() => createReceipt(before, after, smallMapping, result)).toThrow(/no longer matches/)
  })

  it('quotes CSV values, represents missing separately, and guards formulas in every exported cell', async () => {
    const sourceBefore = await load(
      'ID,Value\n=1+1,normal\n+cmd,normal\n-2,normal\n@SUM(A1),normal\n"\t=3",normal\n"\n=4",normal\n001,',
    )
    const sourceAfter = await load(
      'ID,Value\n=1+1,=SUM(A1)\n+cmd,+formula\n-2,-formula\n@SUM(A1),@formula\n"\t=3","\t=evil"\n"\n=4","\r=evil"\n001',
    )
    const result = compareSnapshots(sourceBefore, sourceAfter, {
      beforeKey: 0,
      afterKey: 0,
      fields: [{ label: '=Field', before: 1, after: 1 }],
    })
    const exported = receiptCsv(result)
    expect(exported.endsWith('\r\n')).toBe(true)
    const parsed = Papa.parse<string[]>(exported, { delimiter: ',', skipEmptyLines: true }).data
    expect(parsed[0]).toEqual([
      'kind',
      'id',
      'id_state',
      'before_records',
      'after_records',
      'field',
      'before_value',
      'before_state',
      'after_value',
      'after_state',
    ])
    for (const row of parsed.slice(1)) {
      expect(row).toHaveLength(10)
      expect(row[5]).toBe("'=Field")
      if (row[1] !== '001') expect(row[1].startsWith("'")).toBe(true)
      if (row[1] !== '001') expect(row[8].startsWith("'")).toBe(true)
      expect(row[3]).toMatch(/^\d+$/)
      expect(row[4]).toMatch(/^\d+$/)
    }
    const missing = parsed.find((row) => row[1] === '001')
    expect(missing?.[7]).toBe('empty')
    expect(missing?.[9]).toBe('missing')
    // Supplemental spreadsheet escaping never changes the authoritative evidence.
    expect(sourceAfter.rows[0].cells).toEqual(['=1+1', '=SUM(A1)'])
  })

  it('keeps a wide comparison log proportional to changed cells without repeating full source rows', async () => {
    const fields = Array.from({ length: 63 }, (_, index) => `Field${index + 1}`)
    const header = ['ID', ...fields].join(',')
    const makeSource = (value: string) =>
      `${header}\n${Array.from({ length: 100 }, (_, row) => [String(row).padStart(4, '0'), ...fields.map(() => value)].join(',')).join('\n')}`
    const sourceBefore = await load(makeSource('before'))
    const sourceAfter = await load(makeSource('after'))
    const wideMapping: Mapping = {
      beforeKey: 0,
      afterKey: 0,
      fields: fields.map((label, index) => ({ label, before: index + 1, after: index + 1 })),
    }
    const result = compareSnapshots(sourceBefore, sourceAfter, wideMapping)
    const exported = receiptCsv(result)
    expect(result.summary.changed).toBe(100)
    expect(Papa.parse(exported, { skipEmptyLines: true }).data).toHaveLength(100 * 63 + 1)
    expect(new TextEncoder().encode(exported).byteLength).toBeLessThan(2 * 1024 * 1024)
    expect(exported).not.toContain('rows_json')
  })

  it('stops an amplified CSV incrementally at its UTF-8 byte ceiling and keeps the full receipt available', async () => {
    const fields = Array.from({ length: 63 }, (_, index) => `Field${index + 1}`)
    const header = ['ID', ...fields].join(',')
    // Each source is under 0.5 MiB. Repeating long Unicode IDs across 63 changes
    // would exceed 16 MiB in UTF-8 while remaining below 16 MiB in JS characters.
    const makeSource = (value: string) =>
      `${header}\n${Array.from({ length: 30 }, (_, row) => [`${row}-${'é'.repeat(8_000)}`, ...fields.map(() => value)].join(',')).join('\n')}`
    const sourceBefore = await load(makeSource('a'))
    const sourceAfter = await load(makeSource('b'))
    expect(sourceBefore.byteLength).toBeLessThan(LIMITS.maxBytes)
    expect(sourceAfter.byteLength).toBeLessThan(LIMITS.maxBytes)
    const wideMapping: Mapping = {
      beforeKey: 0,
      afterKey: 0,
      fields: fields.map((label, index) => ({ label, before: index + 1, after: index + 1 })),
    }
    const result = compareSnapshots(sourceBefore, sourceAfter, wideMapping)
    expect(CSV_EXPORT_MAX_BYTES).toBe(16 * 1024 * 1024)
    expect(() => receiptCsv(result)).toThrow(
      'CSV change log exceeds 16 MiB. Download the full JSON receipt',
    )
    expect(
      createReceipt(sourceBefore, sourceAfter, wideMapping, result).comparison.summary.changed,
    ).toBe(30)
    expect(sourceBefore.rows[0].cells[0]).toBe(`0-${'é'.repeat(8_000)}`)
  })
})
