// Independent parser review harness. Synthetic inputs only; no files or network.
// Run with Node 22+: node --experimental-strip-types scripts/review-csv-roundtrip.mjs
import assert from 'node:assert/strict'
import process from 'node:process'
import { TextEncoder } from 'node:util'
import { importSnapshot } from '../src/core/index.ts'

let seed = 17
function random(limit) {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed % limit
}

const alphabet = ['a', '0', ' ', '"', ',', '\r', '\n', '\t', 'é', '☃']
const separators = ['\n', '\r', '\r\n']
const quote = (value) => `"${value.replaceAll('"', '""')}"`
const encode = new TextEncoder()
const CASES = 2_500

for (let testCase = 0; testCase < CASES; testCase++) {
  const columnCount = random(5) + 1
  const headers = Array.from({ length: columnCount }, (_, i) => `H${i}`)
  const expected = []
  let csv = headers.map(quote).join(',')
  const rowCount = random(7)

  for (let row = 0; row < rowCount; row++) {
    const width = random(columnCount) + 1
    const cells = Array.from({ length: width }, () => {
      let value = ''
      const length = random(12)
      for (let i = 0; i < length; i++) value += alphabet[random(alphabet.length)]
      return value
    })
    expected.push([...cells, ...Array(columnCount - width).fill(null)])
    csv += separators[random(separators.length)] + cells.map(quote).join(',')
  }

  if (random(2)) csv += separators[random(separators.length)]
  const snapshot = await importSnapshot('independent-synthetic-review.csv', encode.encode(csv))
  assert.deepEqual(
    snapshot.rows.map((row) => row.cells),
    expected,
    `Generated CSV case ${testCase}; seed=${seed}`,
  )
  assert.equal(snapshot.rawText, csv, `Source text must stay exact for case ${testCase}`)
}

process.stdout.write(`PASS: ${CASES} deterministic synthetic CSV roundtrip cases (seed 17).\n`)
