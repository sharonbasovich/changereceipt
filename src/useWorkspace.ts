import { useRef, useState } from 'react'
import { importSnapshot, LIMITS } from './core'
import type { Snapshot } from './core'
import { loadDemoFiles } from './demo'

export type Side = 'before' | 'after'
type Slot = { snapshot?: Snapshot; busy: boolean; error?: string }
const emptySlots = (): Record<Side, Slot> => ({ before: { busy: false }, after: { busy: false } })

export function useWorkspace(onInvalidate: () => void) {
  const [slots, setSlots] = useState(emptySlots)
  const tokens = useRef({ before: 0, after: 0 })
  const demoAbort = useRef<AbortController | null>(null)
  const [notice, setNotice] = useState('')

  function stopDemo() {
    if (!demoAbort.current) return
    demoAbort.current.abort()
    demoAbort.current = null
    tokens.current.before++
    tokens.current.after++
    setSlots((s) => ({
      before: s.before.busy ? { busy: false } : s.before,
      after: s.after.busy ? { busy: false } : s.after,
    }))
  }

  function cancel(side: Side) {
    stopDemo()
    tokens.current[side]++
    setSlots((s) => ({ ...s, [side]: { busy: false } }))
    setNotice(
      `${side === 'before' ? 'Before' : 'After'} import canceled. Choose a file to try again.`,
    )
    onInvalidate()
  }

  async function read(side: Side, file: File, demoSignal?: AbortSignal) {
    if (!demoSignal) stopDemo()
    const token = ++tokens.current[side]
    onInvalidate()
    setNotice('')
    setSlots((s) => ({ ...s, [side]: { busy: true } }))
    try {
      if (file.size > LIMITS.maxBytes)
        throw new Error('File exceeds the 2 MiB limit. Choose a smaller CSV.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (token !== tokens.current[side] || demoSignal?.aborted) return
      const snapshot = await importSnapshot(file.name, bytes)
      if (token !== tokens.current[side] || demoSignal?.aborted) return
      setSlots((s) => ({ ...s, [side]: { snapshot, busy: false } }))
      setNotice(
        `${side === 'before' ? 'Before' : 'After'} snapshot imported. Choose the ID columns in the next step.`,
      )
    } catch (error) {
      if (token !== tokens.current[side]) return
      setSlots((s) => ({
        ...s,
        [side]: {
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : 'File could not be read. Try another UTF-8 CSV.',
        },
      }))
    }
  }

  async function loadDemo() {
    stopDemo()
    const abort = new AbortController()
    demoAbort.current = abort
    reset(false)
    setNotice('Loading two synthetic snapshots…')
    try {
      const files = await loadDemoFiles(abort.signal)
      if (!abort.signal.aborted)
        await Promise.all([
          read('before', files[0], abort.signal),
          read('after', files[1], abort.signal),
        ])
    } catch (error) {
      if (!abort.signal.aborted)
        setNotice(error instanceof Error ? error.message : 'Synthetic files could not be loaded.')
    } finally {
      if (demoAbort.current === abort) demoAbort.current = null
    }
  }

  function reset(abortDemo = true) {
    if (abortDemo) stopDemo()
    tokens.current.before++
    tokens.current.after++
    setSlots(emptySlots())
    onInvalidate()
    setNotice("Workspace cleared. Files were held in this tab's memory only.")
  }

  function remove(side: Side) {
    stopDemo()
    tokens.current[side]++
    setSlots((s) => ({ ...s, [side]: { busy: false } }))
    onInvalidate()
    setNotice(`${side === 'before' ? 'Before' : 'After'} snapshot removed.`)
  }

  return { slots, read, cancel, remove, reset, loadDemo, notice }
}
