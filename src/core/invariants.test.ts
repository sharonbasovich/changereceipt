import { createHash } from 'node:crypto'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { compareSnapshots, createReceipt, importSnapshot, LIMITS, receiptCsv } from './index'
import type { Comparison, DiffEntry, Mapping, Snapshot } from './index'

// Small deterministic xorshift32: failures print the seed in the test name.
const seeds = Array.from({ length: 40 }, (_, i) => (0x5eedc0de + i * 0x9e3779b9) >>> 0)
function random(seed: number) {
  let state = seed
  return (length: number) => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % length
  }
}
const atoms = [
  '',
  '0',
  '0001',
  '1.0',
  ' ',
  '\t',
  '\r',
  '\n',
  '\r\n',
  ',',
  '"',
  'é',
  'e\u0301',
  '😀',
  '\uFEFF',
  '=1+1',
  '+cmd',
  '-2',
  '@SUM(A1)',
  '__proto__',
  '<b>text</b>',
]
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
function csv(headers: string[], rows: string[][], separator = '\n', bom = false) {
  return `${bom ? '\uFEFF' : ''}${[headers, ...rows].map((row) => row.map(quote).join(',')).join(separator)}`
}
const load = (text: string) => importSnapshot('seeded.csv', new TextEncoder().encode(text))
const mapping: Mapping = {
  beforeKey: 1,
  afterKey: 1,
  fields: [
    { label: 'Value', before: 0, after: 0 },
    { label: 'Other', before: 2, after: 2 },
  ],
}

// Deliberately independent, filter-based classification oracle, not the production grouping algorithm.
function oracle(before: Snapshot, after: Snapshot): Comparison['summary'] {
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0, ambiguous: 0, invalidKey: 0 }
  const keys = new Set([...before.rows, ...after.rows].map((row) => row.cells[1]))
  for (const key of keys) {
    const b = before.rows.filter((row) => row.cells[1] === key)
    const a = after.rows.filter((row) => row.cells[1] === key)
    if (key === null || key === '') summary.invalidKey += b.length + a.length
    else if (b.length > 1 || a.length > 1) summary.ambiguous++
    else if (!b.length) summary.added++
    else if (!a.length) summary.removed++
    else if (b[0].cells[0] !== a[0].cells[0] || b[0].cells[2] !== a[0].cells[2]) summary.changed++
    else summary.unchanged++
  }
  return summary
}
const exactOrder = (a: unknown, b: unknown) => {
  const left = JSON.stringify(a),
    right = JSON.stringify(b)
  return left < right ? -1 : left > right ? 1 : 0
}
const canonical = (entries: DiffEntry[]) =>
  entries
    .map((entry) => ({
      ...entry,
      before: entry.before.map((row) => row.cells).sort(exactOrder),
      after: entry.after.map((row) => row.cells).sort(exactOrder),
    }))
    .sort(exactOrder)
const swapped = (entry: DiffEntry): DiffEntry => ({
  ...entry,
  kind: entry.kind === 'added' ? 'removed' : entry.kind === 'removed' ? 'added' : entry.kind,
  before: entry.after,
  after: entry.before,
  changes: entry.changes.map((change) => ({
    ...change,
    before: change.after,
    after: change.before,
  })),
})

describe('seeded CSV evidence invariants', () => {
  it.each(seeds)(
    'preserves exact strings, bytes, SHA-256 and record ordinals (seed %i)',
    async (seed) => {
      const next = random(seed)
      const headers = ['ID', 'Text', 'More']
      const rows = Array.from({ length: 24 }, (_, i) => [
        String(i),
        ...Array.from({ length: 2 }, () =>
          Array.from({ length: 1 + next(6) }, () => atoms[next(atoms.length)]).join(''),
        ),
      ])
      for (const separator of ['\n', '\r', '\r\n']) {
        const text = csv(headers, rows, separator, next(2) === 1) + separator
        const snapshot = await load(text)
        expect(snapshot.headers).toEqual(headers)
        expect(snapshot.rows).toEqual(rows.map((cells, i) => ({ record: i + 2, cells })))
        expect(snapshot.rawText).toBe(text)
        expect(snapshot.originalBase64).toBe(Buffer.from(text).toString('base64'))
        expect(snapshot.sha256).toBe(createHash('sha256').update(text).digest('hex'))
        expect(snapshot.byteLength).toBe(Buffer.byteLength(text))
      }
    },
  )

  it.each(seeds)(
    'equates minimal, full and mixed quoting with mixed record endings (seed %i)',
    async (seed) => {
      const next = random(seed)
      const records = [
        ['ID', 'Value', 'Other'],
        ...Array.from({ length: 16 }, (_, i) => [
          String(i),
          atoms[next(atoms.length)],
          atoms[next(atoms.length)],
        ]),
      ]
      const minimal = (value: string) => (/[",\r\n]/.test(value) ? quote(value) : value)
      const encoded = records
        .map(
          (row, i) =>
            row.map((value) => (next(2) ? quote(value) : minimal(value))).join(',') +
            ['\r', '\n', '\r\n'][i % 3],
        )
        .join('')
      const mixed = await load(encoded)
      const full = await load(csv(records[0], records.slice(1)))
      expect(mixed.rows).toEqual(full.rows)
      expect(mixed.headers).toEqual(full.headers)
      expect(mixed.warnings).toEqual(full.warnings)
      // Equivalent parsed records need not have equal byte fingerprints.
      expect(mixed.sha256).not.toBe(full.sha256)
    },
  )

  it.each(seeds)(
    'conserves every row and reverses comparison without loss (seed %i)',
    async (seed) => {
      const next = random(seed)
      const ids = [
        '',
        '01',
        '1',
        'A',
        'a',
        ' A',
        '__proto__',
        'constructor',
        '😀',
        'é',
        'e\u0301',
        '\uFEFF',
        '=1',
      ]
      const makeRows = () =>
        Array.from({ length: next(30) }, () =>
          [atoms[next(atoms.length)], ids[next(ids.length)], atoms[next(atoms.length)]].slice(
            0,
            1 + next(3),
          ),
        )
      const bRows = makeRows(),
        aRows = makeRows()
      const before = await load(csv(['Value', 'ID', 'Other'], bRows))
      const after = await load(csv(['Value', 'ID', 'Other'], aRows))
      const evidence = JSON.stringify({ before, after, mapping })
      const result = compareSnapshots(before, after, mapping)
      expect(result.summary).toEqual(oracle(before, after))
      expect(Object.values(result.summary).reduce((sum, n) => sum + n, 0)).toBe(
        result.entries.length,
      )
      for (const side of ['before', 'after'] as const) {
        const source = side === 'before' ? before : after
        const accounted = result.entries.flatMap((entry) => entry[side])
        expect(accounted.map((row) => row.record).sort((a, b) => a - b)).toEqual(
          source.rows.map((row) => row.record),
        )
        for (const row of accounted) expect(source.rows).toContain(row)
      }
      const reverse = compareSnapshots(after, before, mapping)
      expect(canonical(reverse.entries)).toEqual(canonical(result.entries.map(swapped)))
      expect(reverse.complete).toBe(result.complete)
      expect(compareSnapshots(before, after, mapping)).toEqual(result)
      const reordered = compareSnapshots(
        await load(csv(['Value', 'ID', 'Other'], bRows.slice().reverse())),
        await load(csv(['Value', 'ID', 'Other'], aRows.slice().reverse())),
        mapping,
      )
      expect(canonical(reordered.entries)).toEqual(canonical(result.entries))
      expect(reordered.summary).toEqual(result.summary)
      expect(JSON.stringify({ before, after, mapping })).toBe(evidence)
      expect(receiptCsv(result)).toBe(receiptCsv(compareSnapshots(before, after, mapping)))
      expect(JSON.stringify(createReceipt(before, after, mapping, result))).toBe(
        JSON.stringify(createReceipt(before, after, mapping, result)),
      )
    },
  )

  it('removes only the encoding BOM, not a leading BOM codepoint in an unquoted header', async () => {
    const result = await load('\uFEFF\uFEFFID,Value\n1,x')
    expect(result.headers).toEqual(['\uFEFFID', 'Value'])
  })

  it('does not collapse distinct headers after removing an encoding BOM', async () => {
    const result = await load('\uFEFF\uFEFFID,ID\nleft,right')
    expect(result.headers).toEqual(['\uFEFFID', 'ID'])
    expect(result.rows[0].cells).toEqual(['left', 'right'])
  })

  it('retains BOM codepoints in cell data and quoted header content', async () => {
    const result = await load(csv(['\uFEFFID', 'Value'], [['\uFEFF1', '\uFEFF']], '\r\n', true))
    expect(result.headers).toEqual(['\uFEFFID', 'Value'])
    expect(result.rows[0].cells).toEqual(['\uFEFF1', '\uFEFF'])
  })

  it.each(['\n', '\r', '\r\n'])(
    'counts explicit terminal empty and blank records for %j separators',
    async (separator) => {
      const snapshot = await load(`ID,Value${separator}"",${separator}${separator}""${separator}`)
      expect(snapshot.rows.map((row) => row.cells)).toEqual([
        ['', ''],
        ['', null],
        ['', null],
      ])
    },
  )

  it.each(['"', '😀', '\r\n'])(
    'enforces decoded UTF-16 cell length at the boundary for %j',
    async (atom) => {
      const value = atom.repeat(LIMITS.maxCellChars / atom.length)
      expect((await load(csv(['ID', 'Value'], [['1', value]]))).rows[0].cells[1]).toBe(value)
      await expect(load(csv(['ID', 'Value'], [['1', value + 'x']]))).rejects.toMatchObject({
        code: 'cell-limit',
      })
    },
  )

  it('exports null, empty, text and spreadsheet-safe presentation without altering JSON evidence', async () => {
    const values = [
      '',
      'null',
      'undefined',
      '0',
      ' ',
      '\t=1',
      '\u00A0+1',
      '\uFEFF@x',
      '\rplain',
      '\nplain',
      '"quoted",\r\ntext',
    ]
    const before = await load(
      csv(
        ['ID', 'Value'],
        values.map((_, i) => [String(i)]),
      ),
    )
    const after = await load(
      csv(
        ['ID', 'Value'],
        values.map((value, i) => [String(i), value]),
      ),
    )
    const map: Mapping = {
      beforeKey: 0,
      afterKey: 0,
      fields: [{ label: 'Value', before: 1, after: 1 }],
    }
    const result = compareSnapshots(before, after, map)
    const parsed = Papa.parse<string[]>(receiptCsv(result), { skipEmptyLines: true })
    expect(parsed.errors).toEqual([])
    expect(parsed.data).toHaveLength(values.length + 1)
    for (const row of parsed.data.slice(1)) {
      const value = values[Number(row[1])]
      expect(row).toHaveLength(10)
      expect(row[7]).toBe('missing')
      expect(row[9]).toBe(value === '' ? 'empty' : 'text')
      expect(row[8]).toBe(/^[\t\r\n]|^\s*[=+@-]/u.test(value) ? `'${value}` : value)
    }
    expect(
      createReceipt(before, after, map, result).sources.after.rows.map((row) => row.cells[1]),
    ).toEqual(values)
  })
})
