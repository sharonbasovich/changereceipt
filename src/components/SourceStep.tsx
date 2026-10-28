import { useLayoutEffect, useRef } from 'react'
import { FileUp, FileCheck2, X, ArrowRight, FlaskConical } from 'lucide-react'
import type { Snapshot } from '../core'
import type { Side } from '../useWorkspace'

type Slot = { snapshot?: Snapshot; busy: boolean; error?: string }
type Props = {
  slots: Record<Side, Slot>
  onRead: (side: Side, file: File) => void
  onCancel: (side: Side) => void
  onRemove: (side: Side) => void
  onDemo: () => void
  onContinue: () => void
}

export function SourceStep({ slots, onRead, onCancel, onRemove, onDemo, onContinue }: Props) {
  const choosers = useRef<Partial<Record<Side, HTMLInputElement | null>>>({})
  const pendingFocus = useRef<{ side: Side; origin: HTMLButtonElement } | null>(null)
  useLayoutEffect(() => {
    const pending = pendingFocus.current
    pendingFocus.current = null
    // Import completion/failure must not move focus away from the user's next task.
    if (
      !pending ||
      (document.activeElement !== document.body && document.activeElement !== pending.origin)
    )
      return
    choosers.current[pending.side]?.focus()
  })
  function restoreAfterAction(side: Side, origin: HTMLButtonElement, action: (side: Side) => void) {
    if (document.activeElement === origin) pendingFocus.current = { side, origin }
    action(side)
  }
  return (
    <section aria-labelledby="source-title" className="step-content">
      <div className="section-heading">
        <div>
          <h2 id="source-title">Start with two snapshots.</h2>
          <p>The inventory before the handoff, and the inventory after it.</p>
        </div>
      </div>
      <div className="source-grid">
        {(['before', 'after'] as const).map((side, i) => {
          const slot = slots[side]
          return (
            <div className={`source-slot ${slot.snapshot ? 'loaded' : ''}`} key={side}>
              <div className="slot-heading">
                <span className="step-number">{i + 1}</span>
                <h3>{side === 'before' ? 'Before the handoff' : 'After the handoff'}</h3>
              </div>
              {slot.snapshot ? (
                <>
                  <FileCheck2 className="source-icon" aria-hidden="true" />
                  <strong className="filename">{slot.snapshot.name}</strong>
                  <p>
                    {slot.snapshot.rows.length.toLocaleString()} records ·{' '}
                    {slot.snapshot.headers.length} columns
                  </p>
                  <div className="source-actions">
                    <label className="button secondary file-button">
                      Replace {side}
                      <input
                        aria-label={`Replace ${side} CSV`}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ''
                          if (f) onRead(side, f)
                        }}
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${side} snapshot`}
                      onClick={(event) => restoreAfterAction(side, event.currentTarget, onRemove)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  {slot.snapshot.warnings.length > 0 && (
                    <p className="inline-warning">
                      {slot.snapshot.warnings.length} source warning
                      {slot.snapshot.warnings.length === 1 ? '' : 's'} to review
                    </p>
                  )}
                </>
              ) : slot.busy ? (
                <div className="upload-center" role="status">
                  <div className="loading-line" />
                  <strong>Reading {side} snapshot…</strong>
                  <button
                    className="button secondary"
                    onClick={(event) => restoreAfterAction(side, event.currentTarget, onCancel)}
                  >
                    Cancel {side} import
                  </button>
                </div>
              ) : (
                <>
                  <FileUp className="source-icon" aria-hidden="true" />
                  <strong>Choose a CSV snapshot</strong>
                  <p>UTF-8 with a header row</p>
                  <label className="button secondary file-button">
                    Choose {side} CSV
                    <input
                      ref={(node) => {
                        choosers.current[side] = node
                      }}
                      aria-label={`Choose ${side} CSV`}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) onRead(side, f)
                      }}
                    />
                  </label>
                </>
              )}
              {slot.error && (
                <p className="error" role="alert">
                  {slot.error}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="limits">
        Up to 2 MiB, 10,000 records, 64 columns, and 20,000 characters per cell in each file.
        Commas, quoted text, and quoted line breaks are supported.
      </p>
      <div className="demo-strip">
        <FlaskConical aria-hidden="true" size={23} />
        <div>
          <strong>Take a practice handoff.</strong>
          <p>Try synthetic supplies with changed records, a duplicate ID, and a missing value.</p>
        </div>
        <button className="button secondary" onClick={onDemo}>
          Load synthetic example
        </button>
      </div>
      <div className="step-footer">
        <p>Nothing is uploaded. Sources stay in this tab until reset or reload.</p>
        <button
          className="button primary"
          disabled={
            !slots.before.snapshot || !slots.after.snapshot || slots.before.busy || slots.after.busy
          }
          onClick={onContinue}
        >
          Map columns <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}
