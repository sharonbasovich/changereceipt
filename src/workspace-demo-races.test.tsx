// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspace } from './useWorkspace'
import { loadDemoFiles } from './demo'

vi.mock('./demo', () => ({ loadDemoFiles: vi.fn() }))

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
const bytes = (text: string) => new TextEncoder().encode(text).buffer
const file = (name: string, content: string | Promise<ArrayBuffer>) =>
  ({
    name,
    size: typeof content === 'string' ? bytes(content).byteLength : 20,
    arrayBuffer: () => (typeof content === 'string' ? Promise.resolve(bytes(content)) : content),
  }) as File
const pair = (): [File, File] => [
  file('demo-before.csv', 'id,value\n1,Example before\n'),
  file('demo-after.csv', 'id,value\n1,Example after\n'),
]
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(loadDemoFiles).mockReset()
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

describe('independent race probes', () => {
  it.each(['resolve', 'reject'] as const)(
    'supersedes pre-existing imports, even after demo failure (%s)',
    async (outcome) => {
      const original = workspace.slots.before.snapshot
      const pending = deferred<ArrayBuffer>()
      let reading!: Promise<void>
      await act(() => {
        reading = workspace.read('before', file('stale.csv', pending.promise))
      })
      vi.mocked(loadDemoFiles).mockRejectedValue(new Error('Demo failure'))
      await act(() => workspace.loadDemo())
      const notice = workspace.notice
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(bytes('id,value\n99,Stale\n'))
        else pending.reject(new Error('Stale error'))
        await reading
      })
      expect(workspace.slots.before.snapshot).toBe(original)
      expect(workspace.slots.before.busy).toBe(false)
      expect(workspace.slots.before.error).toBeUndefined()
      expect(workspace.notice).toBe(notice)
    },
  )
  it('late finally of first demo cannot clear active second cancellation handle', async () => {
    const first = deferred<[File, File]>()
    const second = deferred<[File, File]>()
    vi.mocked(loadDemoFiles).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    let one!: Promise<void>, two!: Promise<void>
    await act(() => {
      one = workspace.loadDemo()
    })
    await act(() => {
      two = workspace.loadDemo()
    })
    await act(async () => {
      first.resolve(pair())
      await one
    })
    expect(vi.mocked(loadDemoFiles).mock.calls[1][0].aborted).toBe(false)
    await act(() => workspace.cancel('before'))
    expect(vi.mocked(loadDemoFiles).mock.calls[1][0].aborted).toBe(true)
    await act(async () => {
      second.resolve(pair())
      await two
    })
    expect(workspace.slots.before.snapshot?.name).toBe('original-before.csv')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
