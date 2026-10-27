import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, Search, Pencil, ChevronDown, FileText } from 'lucide-react'
import { createReceipt, receiptCsv } from '../core'
import type { Snapshot, Mapping, Comparison, DiffEntry, SourceRow } from '../core'
import { download } from '../download'

const kinds: { kind: DiffEntry['kind']; label: string; summary: keyof Comparison['summary'] }[] = [
  { kind: 'changed', label: 'Changed', summary: 'changed' },
  { kind: 'added', label: 'Added', summary: 'added' },
  { kind: 'removed', label: 'Removed', summary: 'removed' },
  { kind: 'ambiguous', label: 'Ambiguous IDs', summary: 'ambiguous' },
  { kind: 'invalid-key', label: 'Missing IDs', summary: 'invalidKey' },
  { kind: 'unchanged', label: 'Unchanged', summary: 'unchanged' },
]
function cell(value: string | null | undefined) {
  return value == null ? (
    <span className="cell-marker">Missing</span>
  ) : value === '' ? (
    <span className="cell-marker">Empty</span>
  ) : (
    <span className="cell-text">{value}</span>
  )
}
function SourceRows({
  source,
  rows,
  side,
  context = 'comparison result',
}: {
  source: Snapshot
  rows: SourceRow[]
  side: string
  context?: string
}) {
  const [page, setPage] = useState(0)
  if (rows.length === 0) return <p className="no-record">No {side.toLowerCase()} record</p>
  const visible = rows.slice(page * 20, (page + 1) * 20)
  return (
    <div className="source-records">
      <h3>
        {side} source · {source.name}
      </h3>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${side} source records, ${context}, starting at record ${rows[0].record}`}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Record</th>
              {source.headers.map((h, i) => (
                <th scope="col" key={i}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.record}>
                <th scope="row">{row.record}</th>
                {row.cells.map((v, i) => (
                  <td key={i}>{cell(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 20 && (
        <div className="pagination">
          <button
            className="button secondary"
            aria-label={`${side} records previous page`}
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            {side} records {page * 20 + 1}–{Math.min((page + 1) * 20, rows.length)} of {rows.length}
            . All are in the receipt.
          </span>
          <button
            className="button secondary"
            aria-label={`${side} records next page`}
            disabled={(page + 1) * 20 >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
function Entry({ entry, before, after }: { entry: DiffEntry; before: Snapshot; after: Snapshot }) {
  const [open, setOpen] = useState(false)
  const kind = kinds.find((k) => k.kind === entry.kind)!
  const explanation =
    entry.kind === 'ambiguous'
      ? `${entry.before.length} before / ${entry.after.length} after records. No match chosen.`
      : entry.kind === 'invalid-key'
        ? 'Empty or missing ID. No match attempted.'
        : entry.kind === 'changed'
          ? `${entry.changes.length} mapped field${entry.changes.length === 1 ? '' : 's'} changed`
          : entry.kind === 'unchanged'
            ? 'Mapped values are identical'
            : entry.kind === 'added'
              ? 'ID exists only in the after snapshot'
              : 'ID exists only in the before snapshot'
  return (
    <details
      className={`entry entry-${entry.kind}`}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span className={`kind-label kind-${entry.kind}`}>{kind.label}</span>
        <strong className="entry-key">
          {entry.key == null || entry.key === '' ? 'No ID' : entry.key}
        </strong>
        <span className="entry-explanation">{explanation}</span>
        <ChevronDown size={18} className="disclosure" aria-hidden="true" />
      </summary>
      {open && (
        <div className="entry-body">
          {entry.changes.length > 0 && (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label={`Changed fields for before record ${entry.before[0]?.record} and after record ${entry.after[0]?.record}`}
            >
              <table className="changes-table">
                <thead>
                  <tr>
                    <th scope="col">Mapped field</th>
                    <th scope="col">Before</th>
                    <th scope="col">After</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.changes.map((change, i) => (
                    <tr key={i}>
                      <th scope="row">{change.label}</th>
                      <td>{cell(change.before)}</td>
                      <td>{cell(change.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SourceRows source={before} rows={entry.before} side="Before" />
          <SourceRows source={after} rows={entry.after} side="After" />
        </div>
      )}
    </details>
  )
}

function SourceEvidence({ snapshot, side }: { snapshot: Snapshot; side: string }) {
  return (
    <details className="evidence-source">
      <summary>
        <FileText size={18} />
        <strong>
          {side}: {snapshot.name}
        </strong>
        <span>{snapshot.rows.length} records</span>
        <ChevronDown size={16} />
      </summary>
      <div className="evidence-source-body">
        <p>SHA-256</p>
        <code className="hash">{snapshot.sha256}</code>
        <p>
          {snapshot.byteLength.toLocaleString()} original bytes · UTF-8 · record 1 is the header.
          Record numbers count CSV records, including quoted line breaks within a record.
        </p>
        <p>
          The full JSON receipt preserves exact original bytes in originalBase64, alongside the
          decoded source text.
        </p>
        <SourceRows
          source={snapshot}
          rows={snapshot.rows.slice(0, 20)}
          side={side}
          context="original source preview"
        />
        {snapshot.rows.length > 20 && (
          <p>
            Preview shows the first 20 records. The original file and full JSON receipt include
            every record.
          </p>
        )}
      </div>
    </details>
  )
}

export function ReviewStep({
  before,
  after,
  mapping,
  comparison,
  onEdit,
}: {
  before: Snapshot
  after: Snapshot
  mapping: Mapping
  comparison: Comparison
  onEdit: () => void
}) {
  const [filter, setFilter] = useState<DiffEntry['kind'] | 'all'>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [exported, setExported] = useState('')
  const [exportError, setExportError] = useState('')
  const entries = useMemo(
    () =>
      comparison.entries.filter(
        (entry) =>
          (filter === 'all' || entry.kind === filter) &&
          (!query ||
            [
              entry.key,
              ...entry.before.flatMap((r) => r.cells),
              ...entry.after.flatMap((r) => r.cells),
            ].some((v) => v?.toLowerCase().includes(query.toLowerCase()))),
      ),
    [comparison, filter, query],
  )
  const visible = entries.slice(page * 50, (page + 1) * 50)
  function exportReceipt() {
    setExportError('')
    try {
      download(
        JSON.stringify(createReceipt(before, after, mapping, comparison), null, 2),
        'changereceipt.json',
        'application/json',
      )
      setExported('Full receipt downloaded, including original sources and unresolved records.')
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : 'Receipt export failed. Try again while this workspace remains open.',
      )
    }
  }
  function exportCsv() {
    setExportError('')
    try {
      download(receiptCsv(comparison), 'changereceipt-summary.csv', 'text/csv;charset=utf-8')
      setExported('CSV summary downloaded. The full JSON receipt preserves exact source values.')
    } catch (error) {
      setExported('')
      setExportError(
        error instanceof Error
          ? error.message
          : 'CSV export failed. Download the full JSON receipt instead.',
      )
    }
  }
  return (
    <section aria-labelledby="review-title" className="step-content review-step">
      <div className="section-heading">
        <div>
          <h2 id="review-title">A record of the handoff.</h2>
          <p>Recorded differences, with the evidence still attached.</p>
        </div>
        <button className="button secondary" onClick={onEdit}>
          <Pencil size={16} /> Edit mapping
        </button>
      </div>
      <div className={`review-verdict ${comparison.complete ? 'clear' : 'unresolved'}`}>
        {comparison.complete ? (
          <Check size={24} aria-hidden="true" />
        ) : (
          <AlertTriangle size={24} aria-hidden="true" />
        )}
        <div>
          <strong>
            {comparison.complete
              ? 'Comparison complete within the mapped fields'
              : 'This comparison needs human review'}
          </strong>
          <p>
            {comparison.complete
              ? 'All IDs are unique and present. This describes the files, not a physical inventory check.'
              : 'Unresolved IDs stay outside ordinary change counts. Missing cells stay explicit, and this comparison is marked incomplete.'}
          </p>
        </div>
      </div>
      <div className="summary-grid" aria-label="Comparison summary">
        {kinds.map((kind) => (
          <button
            key={kind.kind}
            className={`summary-item ${filter === kind.kind ? 'selected' : ''}`}
            aria-pressed={filter === kind.kind}
            onClick={() => {
              setFilter(filter === kind.kind ? 'all' : kind.kind)
              setPage(0)
            }}
          >
            <span className={`summary-line line-${kind.kind}`} />
            <strong>{comparison.summary[kind.summary]}</strong>
            <span>{kind.label}</span>
          </button>
        ))}
      </div>
      <p className="count-note">
        Added, removed, changed, and unchanged counts are unique IDs. Ambiguities count ID groups;
        missing IDs count individual source records. No quantities are totaled.
      </p>
      <div className="review-toolbar">
        <div className="result-filter">
          <button
            className={`button ${filter === 'all' ? 'primary' : 'secondary'}`}
            aria-pressed={filter === 'all'}
            onClick={() => {
              setFilter('all')
              setPage(0)
            }}
          >
            All results
          </button>
          <span>
            {entries.length.toLocaleString()} result{entries.length === 1 ? '' : 's'}
          </span>
        </div>
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search IDs and source values"
            placeholder="Search IDs or source values"
            value={query}
            maxLength={200}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </label>
      </div>
      <div className="result-column-labels" aria-hidden="true">
        <span>Result</span>
        <span>Item ID</span>
        <span>What the files show</span>
      </div>
      <div className="entries">
        {visible.map((entry, i) => (
          <Entry
            key={`${page}-${i}-${filter}-${query}`}
            entry={entry}
            before={before}
            after={after}
          />
        ))}
        {entries.length === 0 && (
          <div className="mapping-empty">
            No results match this filter. Choose “All results” or clear your search.
          </div>
        )}
      </div>
      {entries.length > 50 && (
        <div className="pagination">
          <button
            className="button secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.ceil(entries.length / 50)}
          </span>
          <button
            className="button secondary"
            disabled={(page + 1) * 50 >= entries.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      <details className="scope">
        <summary>
          Comparison scope & source evidence <ChevronDown size={18} />
        </summary>
        <div className="scope-body">
          <h3>Rules used for this receipt</h3>
          <p>
            Exact, case-sensitive string IDs. No trimming, number conversion, fuzzy matching, or
            duplicate resolution. Empty cells and missing cells are different. Added or removed
            means an ID exists in only one file; it does not establish the reason.
          </p>
          <p>
            <strong>Before ID:</strong> {before.headers[mapping.beforeKey]}
            <br />
            <strong>After ID:</strong> {after.headers[mapping.afterKey]}
          </p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Mapping used">
            <table>
              <thead>
                <tr>
                  <th scope="col">Receipt label</th>
                  <th scope="col">Before column</th>
                  <th scope="col">After column</th>
                </tr>
              </thead>
              <tbody>
                {mapping.fields.map((field, i) => (
                  <tr key={i}>
                    <th scope="row">{field.label}</th>
                    <td>
                      {field.before == null ? 'No column (missing)' : before.headers[field.before]}
                    </td>
                    <td>
                      {field.after == null ? 'No column (missing)' : after.headers[field.after]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {comparison.warnings.length > 0 && (
            <div className="warnings">
              <h3>Warnings & scope limits</h3>
              <ul>
                {comparison.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <SourceEvidence snapshot={before} side="Before" />
          <SourceEvidence snapshot={after} side="After" />
        </div>
      </details>
      <div className="receipt-export">
        <div className="receipt-mark">
          <FileText size={28} />
        </div>
        <div>
          <h3>Keep a receipt, not just a verdict.</h3>
          <p>
            The full JSON contains every result, the rules, the mappings, source hashes, and
            original file bytes. The CSV is a spreadsheet-safe change log, capped at 16 MiB.
          </p>
          <p className="small-copy">
            Hashes identify these bytes; they do not prove who recorded them. Neither export
            verifies a physical handoff.
          </p>
        </div>
        <div className="export-actions">
          <button className="button primary" onClick={exportReceipt}>
            <Download size={18} /> Download full receipt
          </button>
          <button className="button secondary" onClick={exportCsv}>
            Download CSV summary
          </button>
        </div>
      </div>
      <p className="export-status" role="status">
        {exported}
      </p>
      {exportError && (
        <p className="error" role="alert">
          {exportError}
        </p>
      )}
    </section>
  )
}
