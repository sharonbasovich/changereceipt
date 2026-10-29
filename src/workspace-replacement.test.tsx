// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspace } from './useWorkspace'
import type { Side } from './useWorkspace'

let host: HTMLDivElement
let root: Root
let workspace: ReturnType<typeof useWorkspace>
const invalidate = vi.fn()
function Harness() {
  const current = useWorkspace(invalidate)
  useLayoutEffect(() => {
    workspace = current
  })
  return null
}
const bytes = (value: string) => new TextEncoder().encode(value).buffer
const file = (name: string, content: string | Promise<ArrayBuffer>) =>
  ({
    name,
    size: typeof content === 'string' ? bytes(content).byteLength : 20,
    arrayBuffer: () => (typeof content === 'string' ? Promise.resolve(bytes(content)) : content),
  }) as File
function deferred() {
  let resolve!: (value: ArrayBuffer) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<ArrayBuffer>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(() => root.render(<Harness />))
  await act(async () => {
    await workspace.read('before', file('original-before.csv', 'id,value\n0001,Before\n'))
    await workspace.read('after', file('original-after.csv', 'id,value\n0001,After\n'))
  })
  invalidate.mockClear()
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
})

describe('replacement keeps the last successfully imported evidence', () => {
  it.each<Side>(['before', 'after'])('keeps %s evidence after a rejected CSV', async (side) => {
    const original = workspace.slots[side].snapshot
    const other = workspace.slots[side === 'before' ? 'after' : 'before'].snapshot
    await act(() => workspace.read(side, file('bad.csv', 'id,value\n"unclosed')))
    expect(workspace.slots[side].error).toMatch(/Unclosed quoted field/)
    expect(workspace.slots[side].snapshot).toBe(original)
    expect(workspace.slots[side === 'before' ? 'after' : 'before'].snapshot).toBe(other)
    expect(workspace.slots[side].busy).toBe(false)
    expect(invalidate).toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)(
    'restores evidence on cancel and ignores a late %s from the replacement',
    async (outcome) => {
      const original = workspace.slots.before.snapshot
      const pending = deferred()
      let reading!: Promise<void>
      await act(() => {
        reading = workspace.read('before', file('pending.csv', pending.promise))
      })
      expect(workspace.slots.before.busy).toBe(true)
      await act(() => workspace.cancel('before'))
      expect(workspace.slots.before.snapshot).toBe(original)
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(bytes('id,value\n2,Late\n'))
        else pending.reject(new Error('Late failure'))
        await reading
      })
      expect(workspace.slots.before.snapshot).toBe(original)
      expect(workspace.slots.before.error).toBeUndefined()
      expect(workspace.slots.before.busy).toBe(false)
    },
  )

  it('retains the original across overlapping replacements and commits only the latest valid file', async () => {
    const original = workspace.slots.before.snapshot
    const pending = deferred()
    let reading!: Promise<void>
    await act(() => {
      reading = workspace.read('before', file('old-pending.csv', pending.promise))
    })
    await act(() => workspace.read('before', file('new-bad.csv', 'id,id\n1,2\n')))
    expect(workspace.slots.before.snapshot).toBe(original)
    await act(async () => {
      pending.resolve(bytes('id,value\n2,Stale\n'))
      await reading
    })
    expect(workspace.slots.before.snapshot).toBe(original)
    await act(() => workspace.read('before', file('new-good.csv', 'id,value\n3,Latest\n')))
    expect(workspace.slots.before.snapshot?.name).toBe('new-good.csv')
    expect(workspace.slots.before.snapshot?.rawText).toBe('id,value\n3,Latest\n')
    expect(workspace.slots.before.error).toBeUndefined()
  })

  it.each(['reset', 'remove'] as const)(
    'does not restore evidence after explicit %s',
    async (action) => {
      const pending = deferred()
      let reading!: Promise<void>
      await act(() => {
        reading = workspace.read('before', file('pending.csv', pending.promise))
      })
      await act(() => {
        if (action === 'reset') workspace.reset()
        else workspace.remove('before')
      })
      await act(async () => {
        pending.resolve(bytes('id,value\n2,Late\n'))
        await reading
      })
      expect(workspace.slots.before.snapshot).toBeUndefined()
      expect(workspace.slots.before.busy).toBe(false)
    },
  )
})
