import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual, TextDecoder } from 'node:util'
import { Buffer } from 'node:buffer'
import { LIMITS, importSnapshot, compareSnapshots, createReceipt } from '../src/core/index.ts'

// Intentionally a bounded local compatibility tool, not an authenticity service.
export const MAX_RECEIPT_BYTES = 32 * 1024 * 1024
export class VerificationError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
const fail = (code) => {
  throw new VerificationError(code)
}
const check = (condition, code = 'schema') => {
  if (!condition) fail(code)
}
const obj = (value, keys) => {
  check(value !== null && typeof value === 'object' && !Array.isArray(value))
  check(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)))
}
const str = (value, max = LIMITS.maxCellChars) =>
  check(typeof value === 'string' && value.length <= max)
const int = (value, max) => check(Number.isSafeInteger(value) && value >= 0 && value <= max)
const arr = (value, max, fn) => {
  check(Array.isArray(value) && value.length <= max)
  for (const item of value) fn(item)
}
const cell = (value) => {
  if (value !== null) str(value)
}
const row = (value) => {
  obj(value, ['record', 'cells'])
  int(value.record, LIMITS.maxRows + 1)
  check(value.record >= 2)
  arr(value.cells, LIMITS.maxColumns, cell)
}
const warnings = (value) => arr(value, 128, (item) => str(item, LIMITS.maxBytes))
function snapshot(value) {
  obj(value, [
    'name',
    'byteLength',
    'sha256',
    'originalBase64',
    'rawText',
    'headers',
    'rows',
    'warnings',
  ])
  str(value.name, 4096)
  int(value.byteLength, LIMITS.maxBytes)
  check(value.byteLength > 0)
  str(value.sha256, 64)
  check(/^[a-f0-9]{64}$/.test(value.sha256), 'hash-format')
  str(value.originalBase64, 4 * Math.ceil(LIMITS.maxBytes / 3))
  // Canonical RFC 4648 base64 only: no whitespace, junk, URL alphabet or missing padding.
  check(value.originalBase64.length === 4 * Math.ceil(value.byteLength / 3), 'base64')
  check(/^[A-Za-z0-9+/]*={0,2}$/.test(value.originalBase64), 'base64')
  str(value.rawText, LIMITS.maxBytes)
  arr(value.headers, LIMITS.maxColumns, (item) => str(item))
  check(value.headers.length > 0)
  arr(value.rows, LIMITS.maxRows, row)
  warnings(value.warnings)
}
function schema(receipt) {
  obj(receipt, [
    'format',
    'version',
    'purpose',
    'rules',
    'limits',
    'sources',
    'mapping',
    'comparison',
  ])
  check(receipt.format === 'ChangeReceipt' && receipt.version === 1, 'format-version')
  str(receipt.purpose, 4096)
  obj(receipt.rules, [
    'encoding',
    'csv',
    'identifiers',
    'duplicateIds',
    'missingIds',
    'values',
    'scope',
    'counts',
    'ordering',
    'records',
    'evidence',
  ])
  for (const value of Object.values(receipt.rules)) str(value, 4096)
  obj(receipt.limits, Object.keys(LIMITS))
  check(isDeepStrictEqual(receipt.limits, LIMITS), 'limits')
  obj(receipt.sources, ['before', 'after'])
  snapshot(receipt.sources.before)
  snapshot(receipt.sources.after)
  const mapping = receipt.mapping
  obj(mapping, ['beforeKey', 'afterKey', 'fields'])
  int(mapping.beforeKey, LIMITS.maxColumns - 1)
  int(mapping.afterKey, LIMITS.maxColumns - 1)
  arr(mapping.fields, 2 * (LIMITS.maxColumns - 1), (field) => {
    obj(field, ['label', 'before', 'after'])
    str(field.label)
    for (const side of ['before', 'after'])
      if (field[side] !== null) int(field[side], LIMITS.maxColumns - 1)
  })
  const comparison = receipt.comparison
  obj(comparison, ['entries', 'summary', 'warnings', 'complete'])
  check(typeof comparison.complete === 'boolean')
  obj(comparison.summary, ['added', 'removed', 'changed', 'unchanged', 'ambiguous', 'invalidKey'])
  for (const value of Object.values(comparison.summary)) int(value, LIMITS.maxRows * 2)
  warnings(comparison.warnings)
  let references = 0
  arr(comparison.entries, LIMITS.maxRows * 2, (entry) => {
    obj(entry, ['kind', 'key', 'before', 'after', 'changes'])
    check(
      ['added', 'removed', 'changed', 'unchanged', 'ambiguous', 'invalid-key'].includes(entry.kind),
    )
    cell(entry.key)
    for (const side of ['before', 'after']) {
      arr(entry[side], LIMITS.maxRows, row)
      references += entry[side].length
      check(references <= LIMITS.maxRows * 2)
    }
    arr(entry.changes, 2 * (LIMITS.maxColumns - 1), (change) => {
      obj(change, ['label', 'before', 'after'])
      str(change.label)
      cell(change.before)
      cell(change.after)
    })
  })
}

export function parseReceipt(bytes) {
  check(bytes.byteLength <= MAX_RECEIPT_BYTES, 'receipt-size')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('json-encoding')
  }
  // Reject excessive nesting before JSON parsing or walking the object graph.
  let depth = 0,
    quoted = false,
    escaped = false
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{' || char === '[') {
      depth++
      check(depth <= 16, 'json-depth')
    } else if (char === '}' || char === ']') depth--
  }
  let receipt
  try {
    receipt = JSON.parse(text)
  } catch {
    fail('json')
  }
  schema(receipt)
  return receipt
}

export async function verifyBytes(bytes) {
  const receipt = parseReceipt(bytes)
  const sources = {}
  for (const side of ['before', 'after']) {
    const saved = receipt.sources[side]
    const original = Buffer.from(saved.originalBase64, 'base64')
    check(
      original.length === saved.byteLength && original.toString('base64') === saved.originalBase64,
      'base64',
    )
    check(
      createHash('sha256').update(original).digest('hex') === saved.sha256,
      `${side}-hash-mismatch`,
    )
    try {
      sources[side] = await importSnapshot(saved.name, original)
    } catch {
      fail(`${side}-source-import`)
    }
    check(isDeepStrictEqual(sources[side], saved), `${side}-parsed-mismatch`)
  }
  let comparison
  try {
    comparison = compareSnapshots(sources.before, sources.after, receipt.mapping)
  } catch {
    fail('mapping')
  }
  check(isDeepStrictEqual(comparison, receipt.comparison), 'comparison-mismatch')
  const expected = createReceipt(sources.before, sources.after, receipt.mapping, comparison)
  check(isDeepStrictEqual(expected, receipt), 'metadata-mismatch')
  return { summary: comparison.summary, complete: comparison.complete }
}

export async function verifyFile(path) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
    const stat = await handle.stat()
    check(stat.isFile(), 'not-regular-file')
    check(stat.size <= MAX_RECEIPT_BYTES, 'receipt-size')
    // Bounded read even if the file grows after stat; input is never opened for writing.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_RECEIPT_BYTES + 1))
    let count = 0
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count)
      if (!bytesRead) break
      count += bytesRead
    }
    check(count === stat.size, 'file-changed')
    return await verifyBytes(buffer.subarray(0, count))
  } finally {
    await handle?.close()
  }
}
