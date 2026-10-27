import { ArrowRight, Plus, Trash2, Link2 } from 'lucide-react'
import type { Snapshot, FieldMapping, Mapping } from '../core'

type DraftMapping = { beforeKey: number | null; afterKey: number | null; fields: FieldMapping[] }
type Props = {
  before: Snapshot
  after: Snapshot
  mapping: DraftMapping
  setMapping: (mapping: DraftMapping) => void
  onCompare: (mapping: Mapping) => void
  error: string
}
function columnLabel(header: string, index: number) {
  return header.length > 100
    ? `${header.slice(0, 60)}...${header.slice(-20)} [column ${index + 1}]`
    : header
}
function ColumnSelect({
  snapshot,
  value,
  onChange,
  label,
  keyColumn = false,
}: {
  snapshot: Snapshot
  value: number | null
  onChange: (value: number | null) => void
  label: string
  keyColumn?: boolean
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{keyColumn ? 'Choose an ID column' : 'No source column (missing)'}</option>
      {snapshot.headers.map((h, i) => (
        <option value={i} key={i}>
          {columnLabel(h, i)}
        </option>
      ))}
    </select>
  )
}
export function MappingStep({ before, after, mapping, setMapping, onCompare, error }: Props) {
  function updateField(index: number, update: Partial<FieldMapping>) {
    setMapping({
      ...mapping,
      fields: mapping.fields.map((f, i) => (i === index ? { ...f, ...update } : f)),
    })
  }
  function mapSameNames() {
    const fields: FieldMapping[] = []
    before.headers.forEach((h, i) => {
      const j = after.headers.indexOf(h)
      if (j >= 0 && i !== mapping.beforeKey && j !== mapping.afterKey)
        fields.push({ label: h, before: i, after: j })
    })
    setMapping({ ...mapping, fields })
  }
  const ready = mapping.beforeKey !== null && mapping.afterKey !== null && mapping.fields.length > 0
  return (
    <section aria-labelledby="mapping-title" className="step-content">
      <div className="section-heading">
        <div>
          <h2 id="mapping-title">Make the meaning explicit.</h2>
          <p>Choose the identifiers, then pair the fields you want to compare.</p>
        </div>
      </div>
      <div className="key-section">
        <div>
          <span className="small-icon">
            <Link2 size={20} />
          </span>
          <h3>Which column identifies an item?</h3>
          <p>
            IDs are compared exactly. “001” stays different from “1”. Spaces and letter case are
            preserved.
          </p>
        </div>
        <div className="key-selects">
          <label>
            Before ID
            <ColumnSelect
              snapshot={before}
              value={mapping.beforeKey}
              label="Before ID column"
              keyColumn
              onChange={(v) => setMapping({ ...mapping, beforeKey: v, fields: [] })}
            />
          </label>
          <label>
            After ID
            <ColumnSelect
              snapshot={after}
              value={mapping.afterKey}
              label="After ID column"
              keyColumn
              onChange={(v) => setMapping({ ...mapping, afterKey: v, fields: [] })}
            />
          </label>
        </div>
      </div>
      {[...before.headers, ...after.headers].some((h) => h.length > 100) && (
        <p className="limits">
          Long column names are shortened in menus, with their column number shown. Full names
          remain in source evidence and the receipt.
        </p>
      )}
      <div className="field-heading">
        <div>
          <h3>Fields to compare</h3>
          <p>
            Only mapped fields determine “changed” or “unchanged”. All original columns stay in the
            receipt.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={mapping.beforeKey === null || mapping.afterKey === null}
          onClick={mapSameNames}
        >
          Map same-named fields
        </button>
      </div>
      {mapping.fields.length === 0 ? (
        <div className="mapping-empty">
          No fields mapped yet. Match column names above, or add a field to pair columns with
          different names.
        </div>
      ) : (
        <div className="mapping-list">
          {mapping.fields.map((field, i) => (
            <div className="mapping-row" key={i}>
              <label>
                Receipt label
                <input
                  aria-label={`Field ${i + 1} label`}
                  maxLength={100}
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                />
              </label>
              <label>
                Before column
                <ColumnSelect
                  snapshot={before}
                  value={field.before}
                  label={`Field ${i + 1} before column`}
                  onChange={(v) => updateField(i, { before: v })}
                />
              </label>
              <ArrowRight className="mapping-arrow" size={16} />
              <label>
                After column
                <ColumnSelect
                  snapshot={after}
                  value={field.after}
                  label={`Field ${i + 1} after column`}
                  onChange={(v) => updateField(i, { after: v })}
                />
              </label>
              <button
                className="icon-button"
                aria-label={`Remove field ${i + 1}`}
                onClick={() =>
                  setMapping({ ...mapping, fields: mapping.fields.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        className="button text-button"
        disabled={mapping.fields.length >= 64}
        onClick={() =>
          setMapping({
            ...mapping,
            fields: [
              ...mapping.fields,
              { label: `Field ${mapping.fields.length + 1}`, before: null, after: null },
            ],
          })
        }
      >
        <Plus size={18} /> Add a field
      </button>
      <div className="rule-note">
        <strong>Duplicate IDs will remain unresolved.</strong>
        <p>
          If an ID appears twice in either source, its entire group is kept separate. ChangeReceipt
          won’t pick a match for you.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="step-footer">
        <p>Changing an ID column clears field mappings. You can return and revise any choice.</p>
        <button
          className="button primary"
          disabled={!ready}
          onClick={() => onCompare(mapping as Mapping)}
        >
          Compare snapshots <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}
export type { DraftMapping }
