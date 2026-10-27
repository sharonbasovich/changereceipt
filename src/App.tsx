import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, RotateCcw, ShieldCheck } from 'lucide-react'
import { compareSnapshots } from './core'
import type { Comparison, Mapping } from './core'
import { useWorkspace } from './useWorkspace'
import { SourceStep } from './components/SourceStep'
import { MappingStep } from './components/MappingStep'
import type { DraftMapping } from './components/MappingStep'
import { ReviewStep } from './components/ReviewStep'

type Step = 'sources' | 'mapping' | 'review'
const initialMapping = (): DraftMapping => ({ beforeKey: null, afterKey: null, fields: [] })
const steps: { id: Step; title: string; note: string }[] = [
  { id: 'sources', title: 'Your snapshots', note: 'Keep the originals' },
  { id: 'mapping', title: 'Map the columns', note: 'Define the comparison' },
  { id: 'review', title: 'Review & receipt', note: 'See every difference' },
]

export default function App() {
  const [step, setStep] = useState<Step>('sources')
  const [mapping, setMapping] = useState<DraftMapping>(initialMapping)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState('')
  const main = useRef<HTMLElement>(null)
  const previousStep = useRef(step)
  const workspace = useWorkspace(() => {
    setComparison(null)
    setMapping(initialMapping())
    setError('')
    setStep('sources')
  })
  const before = workspace.slots.before.snapshot
  const after = workspace.slots.after.snapshot
  const both = Boolean(before && after)

  useEffect(() => {
    if (previousStep.current !== step) {
      const heading = main.current?.querySelector('h2')
      heading?.setAttribute('tabindex', '-1')
      heading?.focus()
      previousStep.current = step
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [step])

  function runComparison(selected: Mapping) {
    if (!before || !after) return
    try {
      setComparison(compareSnapshots(before, after, selected))
      setError('')
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check your mapping and try again.')
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="ChangeReceipt workspace">
          <span className="brand-symbol" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>ChangeReceipt</span>
        </a>
        <p className="brand-description">A clearer inventory handoff.</p>
        <nav aria-label="Comparison steps">
          <ol>
            {steps.map((item, i) => (
              <li key={item.id}>
                <button
                  className={`step-nav ${step === item.id ? 'active' : ''}`}
                  aria-current={step === item.id ? 'step' : undefined}
                  disabled={
                    item.id === 'mapping' ? !both : item.id === 'review' ? !comparison : false
                  }
                  onClick={() => setStep(item.id)}
                >
                  <span className="nav-number">
                    {(i === 0 && both) || (i === 1 && comparison) ? <Check size={16} /> : i + 1}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.note}</small>
                  </span>
                  {step === item.id && <ArrowRight size={16} />}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="local-note">
          <ShieldCheck size={23} aria-hidden="true" />
          <strong>Local by design.</strong>
          <p>Your files are processed in this browser. No accounts, uploads, or cloud copies.</p>
          <span>Reset or reload clears the workspace.</span>
        </div>
        <p className="sidebar-foot">
          Made for the next volunteer
          <br />
          who picks up the clipboard.
        </p>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <span>Inventory handoff workspace</span>
          <button className="button text-button" onClick={() => workspace.reset()}>
            <RotateCcw size={16} /> Start over
          </button>
        </header>
        <main id="main" ref={main}>
          <div className="page-intro">
            <h1>
              Know what changed.
              <br />
              Keep how you know.
            </h1>
            <p>
              Compare two inventory files, make uncertainty visible, and leave the next volunteer a
              traceable receipt.
            </p>
          </div>
          <div className="step-caption">
            <span>Step {steps.findIndex((s) => s.id === step) + 1} of 3</span>
            <span>
              {step === 'sources'
                ? 'Original files first'
                : step === 'mapping'
                  ? 'Your choices define the scope'
                  : 'Every result has a source'}
            </span>
          </div>
          {step === 'sources' && (
            <SourceStep
              slots={workspace.slots}
              onRead={workspace.read}
              onCancel={workspace.cancel}
              onRemove={workspace.remove}
              onDemo={workspace.loadDemo}
              onContinue={() => setStep('mapping')}
            />
          )}{' '}
          {step === 'mapping' && before && after && (
            <MappingStep
              before={before}
              after={after}
              mapping={mapping}
              setMapping={(m) => {
                setMapping(m)
                setComparison(null)
                setError('')
              }}
              onCompare={runComparison}
              error={error}
            />
          )}{' '}
          {step === 'review' && before && after && comparison && (
            <ReviewStep
              before={before}
              after={after}
              mapping={mapping as Mapping}
              comparison={comparison}
              onEdit={() => setStep('mapping')}
            />
          )}
          <p className="workspace-status" role="status" aria-live="polite">
            {step === 'sources' ? workspace.notice : ''}
          </p>
          <footer className="main-footer">
            <span>ChangeReceipt · Local prototype</span>
            <span>Describes source records. Does not verify physical stock.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
