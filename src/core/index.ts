import Papa from 'papaparse'

/** Bounded for an interactive, local comparison rather than bulk processing. */
export const LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 64,
  maxCellChars: 20_000,
})

/** Separate from source-file limits: a supplemental log can repeat IDs and labels. */
export const CSV_EXPORT_MAX_BYTES = 16 * 1024 * 1024

export type Cell = string | null
export interface SourceRow {
  /** CSV record ordinal, including the header as record 1; not a physical line. */
  record: number
  cells: Cell[]
}
export interface Snapshot {
  name: string
  byteLength: number
  sha256: string
  originalBase64: string
  rawText: string
  headers: string[]
  rows: SourceRow[]
  warnings: string[]
}
export interface FieldMapping {
  label: string
  before: number | null
  after: number | null
}
export interface Mapping {
  beforeKey: number
  afterKey: number
  fields: FieldMapping[]
}
export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged' | 'ambiguous' | 'invalid-key'
export interface FieldChange {
  label: string
  before: Cell
  after: Cell
}
export interface DiffEntry {
  kind: DiffKind
  key: string | null
  before: SourceRow[]
  after: SourceRow[]
  changes: FieldChange[]
}
export interface Comparison {
  entries: DiffEntry[]
  summary: {
    added: number
    removed: number
    changed: number
    unchanged: number
    ambiguous: number
    invalidKey: number
  }
  warnings: string[]
  complete: boolean
}

export class CsvImportError extends Error {
  readonly code: string
  constructor(message: string, code = 'invalid-csv') {
    super(message)
    this.name = 'CsvImportError'
    this.code = code
  }
}

/** Papa handles decoding of quoted fields; this gate rejects permissive non-RFC quoting. */
function checkCsvStructure(text: string): string {
  let state: 'start' | 'unquoted' | 'quoted' | 'closed' = 'start'
  let record = 1
  let columns = 1
  let cellChars = 0
  let chunkStart = 0
  const chunks: string[] = []
  const finishCell = () => {
    cellChars = 0
    state = 'start'
    columns += 1
    if (columns > LIMITS.maxColumns) {
      throw new CsvImportError(
        `Record ${record} exceeds the ${LIMITS.maxColumns}-column limit.`,
        'column-limit',
      )
    }
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cellChars += 1
          i += 1
        } else state = 'closed'
      } else cellChars += 1
    } else if (char === ',') {
      finishCell()
    } else if (char === '\n' || char === '\r') {
      if (char === '\r') {
        chunks.push(text.slice(chunkStart, i), '\n')
        if (text[i + 1] === '\n') i += 1
        chunkStart = i + 1
      }
      record += 1
      columns = 1
      cellChars = 0
      state = 'start'
      // Header + allowed data records + one possible terminal blank record.
      if (record > LIMITS.maxRows + 2) {
        throw new CsvImportError(
          `More than ${LIMITS.maxRows.toLocaleString('en-US')} data records. Split the file before importing.`,
          'row-limit',
        )
      }
    } else if (char === '"') {
      if (state !== 'start') {
        throw new CsvImportError(
          `Unexpected quote in record ${record}. Quote the whole field and double any quote inside it.`,
          'invalid-quote',
        )
      }
      state = 'quoted'
    } else {
      if (state === 'closed') {
        throw new CsvImportError(
          `Unexpected text after a closing quote in record ${record}. A comma or record ending is required.`,
          'invalid-quote',
        )
      }
      state = 'unquoted'
      cellChars += 1
    }
    if (cellChars > LIMITS.maxCellChars) {
      throw new CsvImportError(
        `A field in record ${record} exceeds ${LIMITS.maxCellChars.toLocaleString('en-US')} characters.`,
        'cell-limit',
      )
    }
  }
  if (state === 'quoted')
    throw new CsvImportError(`Unclosed quoted field in record ${record}.`, 'invalid-quote')
  // Normalize record separators only. Newlines inside quoted cell values remain exact.
  return chunks.length > 0 ? chunks.join('') + text.slice(chunkStart) : text
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}

export async function importSnapshot(name: string, bytes: Uint8Array): Promise<Snapshot> {
  if (bytes.byteLength > LIMITS.maxBytes)
    throw new CsvImportError(
      'File exceeds the 2 MiB limit. Split the file before importing.',
      'byte-limit',
    )
  if (bytes.byteLength === 0)
    throw new CsvImportError('The file is empty. Include a header record.', 'empty-file')
  // Parse, fingerprint and preserve the same owned byte sequence.
  const ownedBytes = Uint8Array.from(bytes)
  let rawText: string
  try {
    // ignoreBOM=true preserves the BOM in rawText; parsing removes that marker only.
    rawText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(ownedBytes)
  } catch {
    throw new CsvImportError(
      'The file is not valid UTF-8. Save or export it as UTF-8 CSV, then try again.',
      'encoding',
    )
  }
  if (rawText.includes('\0'))
    throw new CsvImportError(
      'The file contains NUL bytes. Export it as UTF-8 CSV rather than UTF-16 or binary data.',
      'encoding',
    )
  const text = rawText.startsWith('\uFEFF') ? rawText.slice(1) : rawText
  if (text.length === 0)
    throw new CsvImportError('The file contains no header record.', 'empty-file')
  const parseText = checkCsvStructure(text)
  const parsed = Papa.parse<string[]>(parseText, {
    delimiter: ',',
    // We removed the encoding BOM above. Papa strips another leading BOM from
    // string input; restore this chunk so a literal header codepoint stays data.
    beforeFirstChunk: () => parseText,
    newline: '\n',
    quoteChar: '"',
    escapeChar: '"',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    fastMode: false,
    preview: LIMITS.maxRows + 3,
  })
  if (parsed.errors.length > 0) {
    const issue = parsed.errors[0]
    throw new CsvImportError(
      `CSV parse error${typeof issue.row === 'number' ? ` at record ${issue.row + 1}` : ''}: ${issue.message}`,
      'parse',
    )
  }
  const records = parsed.data
  // Only the empty record created by a terminal record separator is ignored.
  // An explicit quoted empty final record, or an interior blank record, is data.
  if (/[\r\n]$/.test(text) && records.at(-1)?.length === 1 && records.at(-1)?.[0] === '')
    records.pop()
  const headers = records.shift()
  if (!headers || headers.every((header) => header.trim() === ''))
    throw new CsvImportError('The first record must contain column names.', 'headers')
  if (headers.some((header) => header.trim() === ''))
    throw new CsvImportError('Every column needs a non-empty name in the first record.', 'headers')
  if (new Set(headers).size !== headers.length)
    throw new CsvImportError(
      'Column names must be unique. Rename duplicate headers before importing.',
      'headers',
    )
  if (records.length > LIMITS.maxRows)
    throw new CsvImportError(
      `More than ${LIMITS.maxRows.toLocaleString('en-US')} data records. Split the file before importing.`,
      'row-limit',
    )
  let shortRows = 0
  const rows = records.map((cells, index): SourceRow => {
    if (cells.length > headers.length)
      throw new CsvImportError(
        `Record ${index + 2} has ${cells.length} cells but the header has ${headers.length}. Check its commas and quoting.`,
        'row-width',
      )
    if (cells.length < headers.length) shortRows += 1
    return {
      record: index + 2,
      cells: Array.from({ length: headers.length }, (_, column) => cells[column] ?? null),
    }
  })
  const warnings =
    shortRows > 0
      ? [
          `${shortRows} data record${shortRows === 1 ? ' has' : 's have'} missing cells. Missing values are preserved separately from empty strings.`,
        ]
      : []
  const digest = await crypto.subtle.digest('SHA-256', ownedBytes)
  return {
    name,
    byteLength: ownedBytes.byteLength,
    sha256: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
      '',
    ),
    originalBase64: toBase64(ownedBytes),
    rawText,
    headers,
    rows,
    warnings,
  }
}

function validColumn(value: number | null, snapshot: Snapshot): boolean {
  return (
    value === null || (Number.isInteger(value) && value >= 0 && value < snapshot.headers.length)
  )
}

export function validateMapping(before: Snapshot, after: Snapshot, mapping: Mapping): void {
  if (
    mapping.beforeKey === null ||
    mapping.afterKey === null ||
    !validColumn(mapping.beforeKey, before) ||
    !validColumn(mapping.afterKey, after)
  ) {
    throw new Error('Choose an ID column in each snapshot. The ID column is never inferred.')
  }
  if (!Array.isArray(mapping.fields) || mapping.fields.length === 0)
    throw new Error('Map at least one field to compare.')
  const labels = new Set<string>()
  const beforeColumns = new Set<number>()
  const afterColumns = new Set<number>()
  for (const field of mapping.fields) {
    if (!field.label.trim()) throw new Error('Give every compared field a non-empty label.')
    if (labels.has(field.label.trim()))
      throw new Error(`The field label “${field.label.trim()}” is used more than once.`)
    labels.add(field.label.trim())
    if (!validColumn(field.before, before) || !validColumn(field.after, after))
      throw new Error(`Choose valid columns for “${field.label}”.`)
    if (field.before === null && field.after === null)
      throw new Error(`“${field.label}” must map to a column in at least one snapshot.`)
    if (field.before === mapping.beforeKey || field.after === mapping.afterKey)
      throw new Error('The ID columns identify rows. Choose other columns for compared fields.')
    if (
      (field.before !== null && beforeColumns.has(field.before)) ||
      (field.after !== null && afterColumns.has(field.after))
    )
      throw new Error('Each source column can be mapped to only one compared field.')
    if (field.before !== null) beforeColumns.add(field.before)
    if (field.after !== null) afterColumns.add(field.after)
  }
}

function groupRows(
  snapshot: Snapshot,
  keyColumn: number,
): { groups: Map<string, SourceRow[]>; invalid: SourceRow[] } {
  const groups = new Map<string, SourceRow[]>()
  const invalid: SourceRow[] = []
  for (const row of snapshot.rows) {
    const key = row.cells[keyColumn]
    if (key === null || key === undefined || key === '') {
      invalid.push(row)
      continue
    }
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return { groups, invalid }
}

function valueAt(row: SourceRow, column: number | null): Cell {
  return column === null ? null : (row.cells[column] ?? null)
}

export function compareSnapshots(before: Snapshot, after: Snapshot, mapping: Mapping): Comparison {
  validateMapping(before, after, mapping)
  const b = groupRows(before, mapping.beforeKey)
  const a = groupRows(after, mapping.afterKey)
  const entries: DiffEntry[] = []
  const summary: Comparison['summary'] = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    ambiguous: 0,
    invalidKey: 0,
  }
  const keys = [...new Set([...b.groups.keys(), ...a.groups.keys()])].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  for (const key of keys) {
    const beforeRows = b.groups.get(key) ?? []
    const afterRows = a.groups.get(key) ?? []
    let kind: DiffKind
    let changes: FieldChange[] = []
    if (beforeRows.length > 1 || afterRows.length > 1) kind = 'ambiguous'
    else if (beforeRows.length === 0) kind = 'added'
    else if (afterRows.length === 0) kind = 'removed'
    else {
      changes = mapping.fields.flatMap((field) => {
        const beforeValue = valueAt(beforeRows[0], field.before)
        const afterValue = valueAt(afterRows[0], field.after)
        return beforeValue === afterValue
          ? []
          : [{ label: field.label, before: beforeValue, after: afterValue }]
      })
      kind = changes.length > 0 ? 'changed' : 'unchanged'
    }
    summary[kind] += 1
    entries.push({ kind, key, before: beforeRows, after: afterRows, changes })
  }
  for (const row of b.invalid)
    entries.push({
      kind: 'invalid-key',
      key: row.cells[mapping.beforeKey] ?? null,
      before: [row],
      after: [],
      changes: [],
    })
  for (const row of a.invalid)
    entries.push({
      kind: 'invalid-key',
      key: row.cells[mapping.afterKey] ?? null,
      before: [],
      after: [row],
      changes: [],
    })
  summary.invalidKey = b.invalid.length + a.invalid.length
  const warnings: string[] = [
    ...before.warnings.map((warning) => `Before: ${warning}`),
    ...after.warnings.map((warning) => `After: ${warning}`),
  ]
  if (summary.ambiguous > 0)
    warnings.push(
      `${summary.ambiguous} duplicate ID group${summary.ambiguous === 1 ? ' is' : 's are'} ambiguous. All rows sharing those IDs are excluded from added, removed, changed and unchanged counts.`,
    )
  if (summary.invalidKey > 0)
    warnings.push(
      `${summary.invalidKey} record${summary.invalidKey === 1 ? ' has' : 's have'} an empty or missing ID and cannot be matched.`,
    )
  const unmapped = (snapshot: Snapshot, key: number, side: 'before' | 'after') =>
    snapshot.headers.filter(
      (_, index) => index !== key && !mapping.fields.some((field) => field[side] === index),
    )
  const ignoredBefore = unmapped(before, mapping.beforeKey, 'before')
  const ignoredAfter = unmapped(after, mapping.afterKey, 'after')
  if (ignoredBefore.length > 0)
    warnings.push(
      `Before columns outside the comparison: ${ignoredBefore.join(', ')}. Original values remain in the receipt.`,
    )
  if (ignoredAfter.length > 0)
    warnings.push(
      `After columns outside the comparison: ${ignoredAfter.join(', ')}. Original values remain in the receipt.`,
    )
  if (keys.some((key) => key !== key.trim()))
    warnings.push(
      'Some IDs contain surrounding whitespace. IDs are compared exactly; whitespace is not removed.',
    )
  const missingCells =
    before.rows.some((row) => row.cells.includes(null)) ||
    after.rows.some((row) => row.cells.includes(null))
  return {
    entries,
    summary,
    warnings,
    complete: summary.ambiguous === 0 && summary.invalidKey === 0 && !missingCells,
  }
}

export interface Receipt {
  format: 'ChangeReceipt'
  version: 1
  purpose: string
  rules: Record<string, string>
  limits: typeof LIMITS
  sources: { before: Snapshot; after: Snapshot }
  mapping: Mapping
  comparison: Comparison
}

/** No clock or random identifier: identical evidence and mapping give identical receipts. */
export function createReceipt(
  before: Snapshot,
  after: Snapshot,
  mapping: Mapping,
  comparison: Comparison,
): Receipt {
  const current = compareSnapshots(before, after, mapping)
  if (JSON.stringify(current) !== JSON.stringify(comparison))
    throw new Error(
      'The comparison no longer matches the sources and mapping. Compare again before exporting.',
    )
  return JSON.parse(
    JSON.stringify({
      format: 'ChangeReceipt',
      version: 1,
      purpose:
        'A comparison of supplied CSV snapshots, not verification of a physical inventory or an explanation of why changes occurred.',
      rules: {
        encoding:
          'UTF-8; optional leading BOM is preserved in originalBase64 and rawText and excluded only from header parsing.',
        csv: 'Comma-delimited, first record headers; quoted fields may contain commas, doubled quotes and record endings. Only a terminal separator-created blank record is ignored.',
        identifiers:
          'Exact string equality. No trimming, case conversion, number conversion or guessed ID columns.',
        duplicateIds:
          'If either snapshot has multiple rows with an ID, the entire ID group is ambiguous. No matching is attempted for that group.',
        missingIds:
          'Empty-string and missing IDs are unresolved individual records. They are excluded from normal change counts.',
        values:
          'Mapped fields use exact string equality. Empty string is an existing empty cell; null is a missing cell or an explicitly unmapped side.',
        scope:
          'Only mapped fields participate. Other source columns are preserved but excluded. Quantities are compared as text; no totals or real-world movement are inferred.',
        counts:
          'Added, removed, changed and unchanged count unique unambiguous IDs. Ambiguous counts ID groups. InvalidKey counts individual source records.',
        ordering:
          'ID groups sort by JavaScript UTF-16 code unit order. Invalid-ID records follow in before-then-after source order.',
        records:
          'Record is a CSV record ordinal: header is 1, first data record is 2. A quoted multiline field does not create an extra record.',
        evidence:
          'originalBase64 preserves original file bytes. sha256 is the SHA-256 of those bytes. Fingerprints identify supplied bytes; they do not authenticate their origin.',
      },
      limits: LIMITS,
      sources: { before, after },
      mapping,
      comparison: current,
    }),
  ) as Receipt
}

/** CSV is a spreadsheet-friendly supplement; the JSON receipt retains exact original values. */
export function receiptCsv(comparison: Comparison): string {
  const safeCell = (value: string | number): string => {
    let text = String(value)
    let start = 0
    while (start < text.length && (text.charCodeAt(start) <= 0x20 || /\s/u.test(text[start])))
      start += 1
    if (
      ['=', '+', '-', '@'].includes(text[start] ?? '') ||
      ['\t', '\r', '\n'].includes(text[0] ?? '')
    )
      text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const header = [
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
  ]
  const lines: string[] = []
  const encoder = new TextEncoder()
  let outputBytes = 0
  const appendLine = (cells: (string | number)[]) => {
    const line = `${cells.map(safeCell).join(',')}\r\n`
    const lineBytes = encoder.encode(line).byteLength
    if (outputBytes + lineBytes > CSV_EXPORT_MAX_BYTES) {
      throw new Error(
        'CSV change log exceeds 16 MiB. Download the full JSON receipt to retain all source evidence.',
      )
    }
    outputBytes += lineBytes
    lines.push(line)
  }
  appendLine(header)
  for (const entry of comparison.entries) {
    const changes: (FieldChange | null)[] = entry.changes.length > 0 ? entry.changes : [null]
    const beforeRecords = entry.before.map((row) => row.record).join(';')
    const afterRecords = entry.after.map((row) => row.record).join(';')
    for (const change of changes)
      appendLine([
        entry.kind,
        entry.key ?? '',
        entry.key === null ? 'missing' : entry.key === '' ? 'empty' : 'text',
        beforeRecords,
        afterRecords,
        change?.label ?? '',
        change?.before ?? '',
        change
          ? change.before === null
            ? 'missing'
            : change.before === ''
              ? 'empty'
              : 'text'
          : 'not-a-field-change',
        change?.after ?? '',
        change
          ? change.after === null
            ? 'missing'
            : change.after === ''
              ? 'empty'
              : 'text'
          : 'not-a-field-change',
      ])
  }
  return lines.join('')
}
