// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspace } from './useWorkspace'
import { loadDemoFiles } from './demo'
import { LIMITS } from './core'

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

describe('synthetic examples replace a workspace atomically', () => {
  it('keeps both snapshots and mapping on a failed fetch', async () => {
    const originals = [workspace.slots.before.snapshot, workspace.slots.after.snapshot]
    vi.mocked(loadDemoFiles).mockRejectedValue(new Error('Synthetic files could not be loaded.'))
    await act(() => workspace.loadDemo())
    expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(originals)
    expect(invalidate).not.toHaveBeenCalled()
    expect(workspace.slots.before.busy || workspace.slots.after.busy).toBe(false)
    expect(workspace.notice).toContain('Synthetic files could not be loaded.')
  })

  it.each(['before', 'after'] as const)(
    'does not commit a partial pair when %s is invalid',
    async (side) => {
      const originals = [workspace.slots.before.snapshot, workspace.slots.after.snapshot]
      const files = pair()
      files[side === 'before' ? 0 : 1] = file('bad.csv', 'id,value\n"unclosed')
      vi.mocked(loadDemoFiles).mockResolvedValue(files)
      await act(() => workspace.loadDemo())
      expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(originals)
      expect(invalidate).not.toHaveBeenCalled()
      expect(workspace.notice).toMatch(/Unclosed quoted field/)
      expect(workspace.slots.before.busy || workspace.slots.after.busy).toBe(false)
    },
  )

  it('keeps the current workspace while either synthetic file is still being read', async () => {
    const originals = [workspace.slots.before.snapshot, workspace.slots.after.snapshot]
    const pending = deferred<ArrayBuffer>()
    vi.mocked(loadDemoFiles).mockResolvedValue([pair()[0], file('demo-after.csv', pending.promise)])
    let loading!: Promise<void>
    await act(() => {
      loading = workspace.loadDemo()
    })
    expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(originals)
    expect(invalidate).not.toHaveBeenCalled()
    expect(workspace.slots.before.busy && workspace.slots.after.busy).toBe(true)
    await act(async () => {
      pending.resolve(bytes('id,value\n1,Example after\n'))
      await loading
    })
    expect(workspace.slots.before.snapshot?.name).toBe('demo-before.csv')
    expect(workspace.slots.after.snapshot?.name).toBe('demo-after.csv')
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(workspace.slots.before.busy || workspace.slots.after.busy).toBe(false)
  })

  it.each(['resolve', 'reject'] as const)(
    'cancels the pair and ignores a late fetch %s',
    async (outcome) => {
      const originals = [workspace.slots.before.snapshot, workspace.slots.after.snapshot]
      const pending = deferred<[File, File]>()
      vi.mocked(loadDemoFiles).mockReturnValue(pending.promise)
      let loading!: Promise<void>
      await act(() => {
        loading = workspace.loadDemo()
      })
      const signal = vi.mocked(loadDemoFiles).mock.calls[0][0]
      await act(() => workspace.cancel('after'))
      expect(signal.aborted).toBe(true)
      expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(originals)
      expect(invalidate).not.toHaveBeenCalled()
      const notice = workspace.notice
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(pair())
        else pending.reject(new Error('Late error'))
        await loading
      })
      expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(originals)
      expect(workspace.notice).toBe(notice)
      expect(workspace.slots.before.busy || workspace.slots.after.busy).toBe(false)
    },
  )

  it.each(['reset', 'remove', 'read', 'demo'] as const)(
    'does not overwrite a newer %s action',
    async (action) => {
      const pending = deferred<ArrayBuffer>()
      vi.mocked(loadDemoFiles).mockResolvedValue([
        pair()[0],
        file('stale-after.csv', pending.promise),
      ])
      let loading!: Promise<void>
      await act(() => {
        loading = workspace.loadDemo()
      })
      await act(async () => {
        if (action === 'reset') workspace.reset()
        if (action === 'remove') workspace.remove('before')
        if (action === 'read')
          await workspace.read('before', file('newer.csv', 'id,value\n2,Newer\n'))
        if (action === 'demo') {
          vi.mocked(loadDemoFiles).mockResolvedValue(pair())
          await workspace.loadDemo()
        }
      })
      const current = [workspace.slots.before.snapshot, workspace.slots.after.snapshot]
      const notice = workspace.notice
      await act(async () => {
        pending.resolve(bytes('id,value\n1,Stale\n'))
        await loading
      })
      expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(current)
      expect(workspace.notice).toBe(notice)
      expect(workspace.slots.before.busy || workspace.slots.after.busy).toBe(false)
    },
  )

  it('does not read an oversized example or discard the current workspace', async () => {
    const originals = [workspace.slots.before.snapshot, workspace.slots.after.snapshot]
    const tooLarge = {
      name: 'too-large.csv',
      size: LIMITS.maxBytes + 1,
      arrayBuffer: vi.fn(),
    } as unknown as File
    vi.mocked(loadDemoFiles).mockResolvedValue([tooLarge, pair()[1]])
    await act(() => workspace.loadDemo())
    expect(tooLarge.arrayBuffer).not.toHaveBeenCalled()
    expect([workspace.slots.before.snapshot, workspace.slots.after.snapshot]).toEqual(originals)
    expect(workspace.notice).toMatch(/2 MiB/)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
