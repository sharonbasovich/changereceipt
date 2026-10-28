import { Buffer } from 'node:buffer'
import { URL } from 'node:url'
import process from 'node:process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { importSnapshot, compareSnapshots, createReceipt, LIMITS } from '../src/core/index.ts'
import { verifyBytes, verifyFile, MAX_RECEIPT_BYTES } from './verify.mjs'
const encode = (value) => Buffer.from(JSON.stringify(value))
async function fixture(
  name = 'handoff',
  mapping = {
    beforeKey: 0,
    afterKey: 0,
    fields: ['Item', 'Location', 'Count', 'Notes'].map((label, index) => ({
      label,
      before: index + 1,
      after: index + 1,
    })),
  },
) {
  const [before, after] = await Promise.all(
    ['before', 'after'].map(async (side) =>
      importSnapshot(
        `${name}-${side}.csv`,
        await readFile(new URL(`../public/fixtures/${name}-${side}.csv`, import.meta.url)),
      ),
    ),
  )
  return createReceipt(before, after, mapping, compareSnapshots(before, after, mapping))
}
const original = await fixture()
const rejects = (receipt, code) =>
  assert.rejects(verifyBytes(encode(receipt)), (error) => error.code === code)
test('real exporter and bundled handoff pass without changing input', async () => {
  const bytes = encode(original),
    saved = Buffer.from(bytes)
  const result = await verifyBytes(bytes)
  assert.deepEqual(result.summary, {
    added: 1,
    removed: 1,
    changed: 2,
    unchanged: 2,
    ambiguous: 1,
    invalidKey: 2,
  })
  assert.equal(result.complete, false)
  assert.deepEqual(bytes, saved)
})
test('missing versus empty bundled fixture passes', async () => {
  await verifyBytes(
    encode(
      await fixture('missing-empty', {
        beforeKey: 0,
        afterKey: 0,
        fields: [{ label: 'Notes', before: 1, after: 1 }],
      }),
    ),
  )
})
const cases = [
  [
    'wrong format',
    (r) => {
      r.format = 'Other'
    },
    'format-version',
  ],
  [
    'future version',
    (r) => {
      r.version = 2
    },
    'format-version',
  ],
  [
    'string version',
    (r) => {
      r.version = '1'
    },
    'format-version',
  ],
  [
    'unknown root property',
    (r) => {
      r.extra = 'x'
    },
    'schema',
  ],
  [
    'source missing',
    (r) => {
      delete r.sources.after
    },
    'schema',
  ],
  [
    'wrong text type',
    (r) => {
      r.sources.before.rawText = []
    },
    'schema',
  ],
  [
    'wrong row type',
    (r) => {
      r.sources.before.rows[0].cells[0] = 1
    },
    'schema',
  ],
  [
    'wrong warnings type',
    (r) => {
      r.sources.before.warnings = 'warning'
    },
    'schema',
  ],
  [
    'bad base64 alphabet',
    (r) => {
      r.sources.before.originalBase64 = '!'.repeat(r.sources.before.originalBase64.length)
    },
    'base64',
  ],
  [
    'base64 whitespace',
    (r) => {
      r.sources.before.originalBase64 = ` ${r.sources.before.originalBase64.slice(1)}`
    },
    'base64',
  ],
  [
    'base64 truncation',
    (r) => {
      r.sources.before.originalBase64 = r.sources.before.originalBase64.slice(0, -1)
    },
    'base64',
  ],
  [
    'byte size overflow',
    (r) => {
      r.sources.before.byteLength = LIMITS.maxBytes + 1
    },
    'schema',
  ],
  [
    'hash type',
    (r) => {
      r.sources.before.sha256 = 123
    },
    'schema',
  ],
  [
    'bad hash alphabet',
    (r) => {
      r.sources.before.sha256 = 'g'.repeat(64)
    },
    'hash-format',
  ],
  [
    'hash mismatch',
    (r) => {
      r.sources.before.sha256 = '0'.repeat(64)
    },
    'before-hash-mismatch',
  ],
  [
    'after hash mismatch',
    (r) => {
      r.sources.after.sha256 = '0'.repeat(64)
    },
    'after-hash-mismatch',
  ],
  [
    'decoded text mismatch',
    (r) => {
      r.sources.before.rawText += 'x'
    },
    'before-parsed-mismatch',
  ],
  [
    'headers mismatch',
    (r) => {
      r.sources.before.headers[0] = 'different'
    },
    'before-parsed-mismatch',
  ],
  [
    'row values mismatch',
    (r) => {
      r.sources.before.rows[0].cells[0] = 'different'
    },
    'before-parsed-mismatch',
  ],
  [
    'record ordinal mismatch',
    (r) => {
      r.sources.before.rows[0].record = 3
    },
    'before-parsed-mismatch',
  ],
  [
    'source warnings mismatch',
    (r) => {
      r.sources.before.warnings = []
    },
    'before-parsed-mismatch',
  ],
  [
    'stale comparison',
    (r) => {
      r.comparison.summary.changed = 0
    },
    'comparison-mismatch',
  ],
  [
    'entry value mismatch',
    (r) => {
      r.comparison.entries[0].before[0].cells[0] = 'different'
    },
    'comparison-mismatch',
  ],
  [
    'comparison warning mismatch',
    (r) => {
      r.comparison.warnings = []
    },
    'comparison-mismatch',
  ],
  [
    'comparison complete type',
    (r) => {
      r.comparison.complete = 'false'
    },
    'schema',
  ],
  [
    'empty mapping',
    (r) => {
      r.mapping.fields = []
    },
    'mapping',
  ],
  [
    'mapping label type',
    (r) => {
      r.mapping.fields[0].label = {}
    },
    'schema',
  ],
  [
    'invalid key mapping',
    (r) => {
      r.mapping.beforeKey = 63
    },
    'mapping',
  ],
  [
    'duplicate mapping label',
    (r) => {
      r.mapping.fields[1].label = r.mapping.fields[0].label
    },
    'mapping',
  ],
  [
    'stale mapping',
    (r) => {
      r.mapping.fields[2].label = 'New name'
    },
    'comparison-mismatch',
  ],
  [
    'altered rules',
    (r) => {
      r.rules.values = 'numbers'
    },
    'metadata-mismatch',
  ],
  [
    'altered purpose',
    (r) => {
      r.purpose = 'Authentic!'
    },
    'metadata-mismatch',
  ],
  [
    'altered limits',
    (r) => {
      r.limits.maxBytes = 1
    },
    'limits',
  ],
  [
    'too many rows',
    (r) => {
      r.sources.before.rows = Array(LIMITS.maxRows + 1).fill({ record: 2, cells: [] })
    },
    'schema',
  ],
  [
    'overlong cell',
    (r) => {
      r.sources.before.rows[0].cells[0] = 'a'.repeat(LIMITS.maxCellChars + 1)
    },
    'schema',
  ],
]
for (const [name, mutate, code] of cases)
  test(name, async () => {
    const r = JSON.parse(JSON.stringify(original))
    mutate(r)
    await rejects(r, code)
  })
test('noncanonical base64 pad bits reject', async () => {
  const source = await importSnapshot('small.csv', Buffer.from('i,v\na,b\n'))
  const mapping = { beforeKey: 0, afterKey: 0, fields: [{ label: 'v', before: 1, after: 1 }] }
  const r = createReceipt(source, source, mapping, compareSnapshots(source, source, mapping))
  assert.ok(r.sources.before.originalBase64.endsWith('o='))
  r.sources.before.originalBase64 = r.sources.before.originalBase64.slice(0, -2) + 'p='
  await rejects(r, 'base64')
})
test('valid hash but malformed embedded CSV rejects with safe code', async () => {
  const r = JSON.parse(JSON.stringify(original))
  const source = r.sources.before
  const bytes = Buffer.from('id,value\n"unclosed')
  source.byteLength = bytes.length
  source.originalBase64 = bytes.toString('base64')
  const { createHash } = await import('node:crypto')
  source.sha256 = createHash('sha256').update(bytes).digest('hex')
  await rejects(r, 'before-source-import')
})
test('bounded JSON: invalid, encoding, depth and size', async () => {
  for (const [bytes, code] of [
    [Buffer.from('{'), 'json'],
    [Buffer.from([255]), 'json-encoding'],
    [Buffer.from('['.repeat(17)), 'json-depth'],
    [Buffer.alloc(MAX_RECEIPT_BYTES + 1), 'receipt-size'],
  ]) {
    await assert.rejects(verifyBytes(bytes), (error) => error.code === code)
  }
})
test('consistent rewrite passes: this is not authenticity', async () => {
  const r = JSON.parse(JSON.stringify(original))
  const before = await importSnapshot(
    'arbitrary-name.csv',
    Buffer.from(r.sources.before.rawText.replace('0001', '9001')),
  )
  const after = r.sources.after
  await verifyBytes(
    encode(createReceipt(before, after, r.mapping, compareSnapshots(before, after, r.mapping))),
  )
})
test('JSON object key order is irrelevant', async () => {
  await verifyBytes(encode(Object.fromEntries(Object.entries(original).reverse())))
})
test('CLI statuses, quiet safe errors, read-only and size gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'receipt-verifier-'))
  try {
    const path = join(dir, 'receipt.json')
    const bytes = encode(original)
    await writeFile(path, bytes)
    const cli = (...args) =>
      spawnSync(
        process.execPath,
        ['--experimental-strip-types', new URL('./cli.mjs', import.meta.url).pathname, ...args],
        { encoding: 'utf8' },
      )
    assert.equal(cli('--help').status, 0)
    assert.equal(cli().status, 2)
    assert.equal(cli(path, path).status, 2)
    assert.equal(cli(join(dir, 'missing')).status, 2)
    assert.equal(cli(path).status, 0)
    assert.deepEqual(await readFile(path), bytes)
    await writeFile(path, '{"PRIVATE_SOURCE_VALUE":')
    const invalid = cli(path)
    assert.equal(invalid.status, 1)
    assert.ok(!`${invalid.stdout}${invalid.stderr}`.includes('PRIVATE_SOURCE_VALUE'))
    await truncate(path, MAX_RECEIPT_BYTES + 1)
    await assert.rejects(verifyFile(path), (error) => error.code === 'receipt-size')
    assert.equal(cli(path).status, 1)
    await assert.rejects(verifyFile(dir), (error) => error.code === 'not-regular-file')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('large valid source exercises bounded base64 and parser path', async () => {
  const bytes = Buffer.from(
    'id,value\n' + Array.from({ length: 104 }, (_, i) => `${i},${'v'.repeat(20000)}\n`).join(''),
  )
  assert.ok(bytes.length < LIMITS.maxBytes && bytes.length > LIMITS.maxBytes * 0.99)
  const source = await importSnapshot('large.csv', bytes)
  const mapping = { beforeKey: 0, afterKey: 0, fields: [{ label: 'value', before: 1, after: 1 }] }
  await verifyBytes(
    encode(createReceipt(source, source, mapping, compareSnapshots(source, source, mapping))),
  )
})
