// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { MappingStep, type DraftMapping } from './MappingStep'
import { validateMapping, type Snapshot, type Mapping } from '../core'

let host: HTMLDivElement
let root: Root
let latest: DraftMapping
const snapshot = (headers: string[]): Snapshot => ({
  name: 'fixture.csv',
  headers,
  rows: [],
  warnings: [],
  byteLength: 0,
  sha256: '',
  originalBase64: '',
  rawText: '',
})
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
})
async function render(headers: string[], fields: DraftMapping['fields'] = []) {
  const source = snapshot(headers)
  function Harness() {
    const [mapping, setMapping] = useState<DraftMapping>({ beforeKey: 0, afterKey: 0, fields })
    latest = mapping
    return (
      <MappingStep
        before={source}
        after={source}
        mapping={mapping}
        setMapping={setMapping}
        onCompare={() => {}}
        error=""
      />
    )
  }
  await act(() => root.render(<Harness />))
  return source
}
async function click(name: string) {
  const button = [...host.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  )
  if (!button) throw new Error(`Missing ${name}`)
  await act(() => button.click())
}
test('same-name matching generates valid distinct labels for exact-distinct whitespace headers', async () => {
  const headers = ['ID', 'Name', ' Name ', 'Name (2)', '\tName\t']
  const expectedHeaders = [...headers]
  const source = await render(headers)
  await click('Map same-named fields')
  expect(() => validateMapping(source, source, latest as Mapping)).not.toThrow()
  expect(new Set(latest.fields.map((f) => f.label.trim())).size).toBe(4)
  expect(latest.fields.map((f) => [f.before, f.after])).toEqual([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ])
  expect(source.headers).toEqual(expectedHeaders)
})
test('adding after removal never reuses an existing generated or manual label', async () => {
  await render(
    ['ID', 'a', 'b'],
    [
      { label: 'Field 1', before: 1, after: 1 },
      { label: ' Field 3 ', before: 2, after: 2 },
      { label: 'Field 3 (2)', before: null, after: null },
    ],
  )
  await click('Remove field 1')
  await click('Add a field')
  expect(new Set(latest.fields.map((f) => f.label.trim())).size).toBe(3)
  expect(latest.fields.slice(0, 2).map((f) => f.label)).toEqual([' Field 3 ', 'Field 3 (2)'])
})
test('ordinary same-named headers keep their labels and ID exclusions', async () => {
  await render(['ID', 'Count', 'Notes'])
  await click('Map same-named fields')
  expect(latest.fields).toEqual([
    { label: 'Count', before: 1, after: 1 },
    { label: 'Notes', before: 2, after: 2 },
  ])
})
