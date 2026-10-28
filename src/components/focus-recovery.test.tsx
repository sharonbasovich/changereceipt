// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MappingStep, type DraftMapping } from './MappingStep'
import { SourceStep } from './SourceStep'
import { useWorkspace } from '../useWorkspace'
import type { Snapshot } from '../core'
import App from '../App'

const snapshot: Snapshot = {
  name: 'sample.csv',
  byteLength: 0,
  sha256: '',
  originalBase64: '',
  rawText: '',
  headers: ['id', 'a', 'b', 'c'],
  rows: [],
  warnings: [],
}
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})
function button(name: string) {
  const found = [...host.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  )
  if (!found) throw new Error(`Missing button: ${name}`)
  return found
}
async function click(name: string) {
  const target = button(name)
  target.focus()
  await act(() => target.click())
}
function MappingHarness() {
  const [mapping, setMapping] = useState<DraftMapping>({
    beforeKey: 0,
    afterKey: 0,
    fields: ['a', 'b', 'c'].map((label, i) => ({ label, before: i + 1, after: i + 1 })),
  })
  return (
    <MappingStep
      before={snapshot}
      after={snapshot}
      mapping={mapping}
      setMapping={setMapping}
      onCompare={() => {}}
      error=""
    />
  )
}
function SourceHarness() {
  const workspace = useWorkspace(() => {})
  return (
    <>
      <button onClick={() => workspace.reset()}>Reset</button>
      <SourceStep
        slots={workspace.slots}
        onRead={workspace.read}
        onCancel={workspace.cancel}
        onRemove={workspace.remove}
        onDemo={() => {}}
        onContinue={() => {}}
      />
    </>
  )
}
function chooser(side: string) {
  return host.querySelector<HTMLInputElement>(`input[aria-label="Choose ${side} CSV"]`)!
}
async function read(side: string, bytes: Promise<ArrayBuffer>) {
  const input = chooser(side)
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ name: 'sample.csv', size: 10, arrayBuffer: () => bytes }],
  })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}
async function loaded(side: string) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(button(`Remove ${side} snapshot`)).toBeTruthy()
  })
}
const csv = () => Promise.resolve(new TextEncoder().encode('id,a\n1,A').buffer)

describe('mapping removal keyboard focus', () => {
  it('moves from middle to next row, then previous row, then Add a field on repeated removals', async () => {
    await act(() => root.render(<MappingHarness />))
    await click('Remove field 2')
    expect(document.activeElement).toBe(button('Remove field 2'))
    expect(host.querySelector<HTMLInputElement>('[aria-label="Field 2 label"]')?.value).toBe('c')
    await click('Remove field 2')
    expect(document.activeElement).toBe(button('Remove field 1'))
    await click('Remove field 1')
    expect(document.activeElement).toBe(button('Add a field'))
    await click('Add a field')
    await click('Remove field 1')
    expect(document.activeElement).toBe(button('Add a field'))
  })
})
describe('source action keyboard focus', () => {
  it.each(['before', 'after'])('returns to %s chooser after repeated removal', async (side) => {
    await act(() => root.render(<SourceHarness />))
    for (let i = 0; i < 2; i++) {
      await read(side, csv())
      await loaded(side)
      await click(`Remove ${side} snapshot`)
      expect(document.activeElement).toBe(chooser(side))
    }
  })
  it('returns to chooser on cancel, ignores late completion, and can import again', async () => {
    await act(() => root.render(<SourceHarness />))
    let resolve!: (bytes: ArrayBuffer) => void
    await read(
      'before',
      new Promise((r) => {
        resolve = r
      }),
    )
    await click('Cancel before import')
    expect(document.activeElement).toBe(chooser('before'))
    await act(async () => resolve(await csv()))
    expect(document.activeElement).toBe(chooser('before'))
    expect(host.querySelector('[aria-label="Remove before snapshot"]')).toBeNull()
    await read('before', csv())
    await loaded('before')
    expect(button('Remove before snapshot')).toBeTruthy()
  })
  it('does not steal focus when a background read fails or succeeds', async () => {
    await act(() => root.render(<SourceHarness />))
    for (const fails of [true, false]) {
      let resolve!: (bytes: ArrayBuffer) => void
      let reject!: (error: Error) => void
      await read(
        'before',
        new Promise((r, j) => {
          resolve = r
          reject = j
        }),
      )
      chooser('after').focus()
      await act(async () => {
        if (fails) reject(new Error('Read failed'))
        else resolve(await csv())
      })
      if (!fails) await loaded('before')
      expect(document.activeElement).toBe(chooser('after'))
    }
  })
  it('reset retains focus and invalidates a pending import without resurrecting it', async () => {
    await act(() => root.render(<SourceHarness />))
    for (let i = 0; i < 2; i++) {
      let resolve!: (bytes: ArrayBuffer) => void
      await read(
        'before',
        new Promise((r) => {
          resolve = r
        }),
      )
      await click('Reset')
      expect(document.activeElement).toBe(button('Reset'))
      await act(async () => resolve(await csv()))
      expect(document.activeElement).toBe(button('Reset'))
      expect(chooser('before')).toBeTruthy()
    }
  })
})

describe('full workspace focus integration', () => {
  it('keeps step-heading focus and resets cleanly through three complete cycles', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    await act(() => root.render(<App />))
    for (let i = 0; i < 3; i++) {
      await read('before', csv())
      await loaded('before')
      await read('after', csv())
      await loaded('after')
      await click('Map columns')
      expect(document.activeElement).toBe(host.querySelector('#mapping-title'))
      for (const name of ['Before ID column', 'After ID column']) {
        const select = host.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!
        await act(() => {
          select.value = '0'
          select.dispatchEvent(new Event('change', { bubbles: true }))
        })
      }
      await click('Map same-named fields')
      await click('Compare snapshots')
      expect(document.activeElement?.tagName).toBe('H2')
      expect(host.querySelector('#mapping-title')).toBeNull()
      await click('Start over')
      expect(document.activeElement).toBe(host.querySelector('#source-title'))
      expect(chooser('before')).toBeTruthy()
      expect(chooser('after')).toBeTruthy()
    }
  })
  it('does not steal focus for a removal activated while another control is focused', async () => {
    await act(() => root.render(<SourceHarness />))
    await read('before', csv())
    await loaded('before')
    chooser('after').focus()
    await act(() => button('Remove before snapshot').click())
    expect(document.activeElement).toBe(chooser('after'))
  })
})
