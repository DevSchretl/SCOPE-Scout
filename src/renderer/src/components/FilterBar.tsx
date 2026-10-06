import { useMemo, useState } from 'react'
import {
  Hash,
  List,
  ListFilter,
  Search,
  ToggleLeft,
  Trash2,
  Type,
  X,
  type LucideIcon
} from 'lucide-react'
import {
  FIELD_GROUPS,
  FIELDS,
  PRESETS,
  choiceName,
  describeCondition,
  fieldById,
  isActive,
  newCondition,
  opLabel,
  opsFor,
  optionsFor,
  sameCondition,
  withOp,
  type ChoiceField,
  type Condition,
  type Field,
  type Op
} from '../../../shared/filters'
import { fold } from '../../../shared/text'
import type { Posting } from '../../../shared/types'
import Popover, { type PopoverReason } from './Popover'

const TYPE_ICONS: Record<Field['type'], LucideIcon> = {
  number: Hash,
  text: Type,
  choice: List,
  bool: ToggleLeft
}

interface Props {
  conditions: Condition[]
  onChange: (conditions: Condition[]) => void
  /** The postings before filtering, for the value lists and their counts. */
  postings: Posting[]
  /** The fields on offer (all of them by default). */
  fields?: Field[]
}

export default function FilterBar({
  conditions,
  onChange,
  postings,
  fields = FIELDS
}: Props): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [fieldQuery, setFieldQuery] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const count = conditions.filter(isActive).length

  function add(c: Condition, edit: boolean): void {
    // Adding a condition clears out any left unfinished.
    const next = [...conditions.filter(isActive), c]
    onChange(next)
    setAdding(false)
    setFieldQuery('')
    setEditing(edit ? next.length - 1 : null)
  }

  function update(i: number, c: Condition): void {
    onChange(conditions.map((x, j) => (j === i ? c : x)))
  }

  function remove(i: number): void {
    onChange(conditions.filter((_, j) => j !== i))
    setEditing(null)
  }

  function closeEditor(i: number, reason: PopoverReason | 'done'): void {
    setEditing(null)
    // Closing on purpose drops a condition that never got a value. A click elsewhere
    // leaves it (dashed), since that click may be on another chip's remove button.
    if (reason !== 'outside' && conditions[i] && !isActive(conditions[i])) remove(i)
  }

  const q = fold(fieldQuery.trim())
  const offered = fields.filter((f) => !q || fold(`${f.label} ${f.group}`).includes(q))

  return (
    <div className="filter-bar">
      <Popover
        open={adding}
        onOpenChange={(o) => {
          setAdding(o)
          setFieldQuery('')
          if (o) setEditing(null)
        }}
        role="dialog"
        buttonClass={count ? 'btn filter-button active' : 'btn filter-button'}
        panelClass="filter-panel"
        title="Add a filter"
        label={
          <>
            <ListFilter size={15} />
            Filter
            {count > 0 && <span className="filter-count">{count}</span>}
          </>
        }
      >
        <div className="menu-label">Quick filters</div>
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="preset"
              disabled={conditions.some((c) => sameCondition(c, p.condition))}
              onClick={() => add(p.condition, false)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="menu-sep" />
        <label className="menu-search">
          <Search size={14} />
          <input
            data-autofocus
            data-menu-search
            placeholder="Find a field"
            aria-label="Find a field"
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
          />
        </label>
        <div className="field-list">
          {FIELD_GROUPS.map((group) => {
            const inGroup = offered.filter((f) => f.group === group)
            if (!inGroup.length) return null
            return (
              <div key={group} className="menu-group">
                <div className="menu-label">{group}</div>
                {inGroup.map((f) => {
                  const Icon = TYPE_ICONS[f.type]
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="menu-item"
                      onClick={() => add(newCondition(f), true)}
                    >
                      <Icon size={15} className="type-icon" />
                      {f.label}
                    </button>
                  )
                })}
              </div>
            )
          })}
          {!offered.length && <p className="menu-empty">No field matches that.</p>}
        </div>
      </Popover>

      {conditions.map((c, i) => {
        const field = fieldById(c.field)
        if (!field) return null
        const text = describeCondition(c)
        return (
          <div key={i} className={isActive(c) ? 'filter-chip' : 'filter-chip unfinished'}>
            <Popover
              open={editing === i}
              onOpenChange={(o, reason) => (o ? setEditing(i) : closeEditor(i, reason))}
              role="dialog"
              buttonClass="chip-label"
              panelClass="cond-panel"
              title="Edit this filter"
              label={text}
            >
              <ConditionEditor
                condition={c}
                field={field}
                postings={postings}
                onChange={(next) => update(i, next)}
                onRemove={() => remove(i)}
                onDone={() => closeEditor(i, 'done')}
              />
            </Popover>
            <button
              type="button"
              className="chip-x"
              title="Remove"
              aria-label={`Remove filter: ${text}`}
              onClick={() => remove(i)}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}

      {conditions.length > 0 && (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            onChange([])
            setEditing(null)
          }}
        >
          Clear all
        </button>
      )}
    </div>
  )
}

interface EditorProps {
  condition: Condition
  field: Field
  postings: Posting[]
  onChange: (c: Condition) => void
  onRemove: () => void
  onDone: () => void
}

function ConditionEditor({
  condition,
  field,
  postings,
  onChange,
  onRemove,
  onDone
}: EditorProps): React.JSX.Element {
  const ops = opsFor(field)
  const noValue = condition.op === 'empty' || condition.op === 'notEmpty'
  return (
    <div className="cond-editor">
      <div className="cond-title">{field.label}</div>
      {ops.length > 1 && (
        <select
          className="select"
          aria-label="Condition"
          data-autofocus={noValue || undefined}
          value={condition.op}
          onChange={(e) => onChange(withOp(condition, e.target.value as Op))}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {opLabel(field, op)}
            </option>
          ))}
        </select>
      )}
      <ValueEditor
        key={condition.op}
        condition={condition}
        field={field}
        postings={postings}
        onChange={onChange}
      />
      <div className="cond-foot">
        <button type="button" className="btn ghost sm danger" onClick={onRemove}>
          <Trash2 size={14} />
          Remove
        </button>
        <button type="button" className="btn primary sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

function ValueEditor({
  condition: c,
  field,
  postings,
  onChange
}: Omit<EditorProps, 'onRemove' | 'onDone'>): React.JSX.Element | null {
  const step = field.type === 'number' ? field.step : 1
  const unit = field.type === 'number' ? field.unit : undefined
  switch (c.op) {
    case 'gte':
    case 'lte': {
      const cond = c
      return (
        <div className="cond-row">
          <NumberBox
            value={cond.value}
            step={step}
            autoFocus
            onChange={(n) => onChange({ ...cond, value: n })}
          />
          {unit}
        </div>
      )
    }
    case 'between': {
      const cond = c
      const [a, b] = cond.value
      return (
        <div className="cond-row">
          <NumberBox
            value={a}
            step={step}
            autoFocus
            onChange={(n) => onChange({ ...cond, value: [n, b] })}
          />
          and
          <NumberBox value={b} step={step} onChange={(n) => onChange({ ...cond, value: [a, n] })} />
          {unit}
        </div>
      )
    }
    case 'contains':
    case 'notContains': {
      const cond = c
      return (
        <input
          className="input"
          data-autofocus
          aria-label="Text"
          placeholder="Type a word or two"
          value={cond.value}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
        />
      )
    }
    case 'in':
    case 'notIn': {
      const cond = c
      if (field.type !== 'choice') return null
      return (
        <ChoiceList
          field={field}
          selected={cond.value}
          postings={postings}
          onChange={(value) => onChange({ ...cond, value })}
        />
      )
    }
    case 'is': {
      const cond = c
      if (field.type !== 'bool') return null
      return (
        <div className="segmented" role="group" aria-label={field.label}>
          <button
            type="button"
            data-autofocus
            aria-pressed={cond.value}
            onClick={() => onChange({ ...cond, value: true })}
          >
            {field.yes}
          </button>
          <button
            type="button"
            aria-pressed={!cond.value}
            onClick={() => onChange({ ...cond, value: false })}
          >
            {field.no}
          </button>
        </div>
      )
    }
    default:
      return null
  }
}

/** A number box that keeps what you type ("7.") while passing on the number. */
function NumberBox({
  value,
  step,
  autoFocus,
  onChange
}: {
  value: number
  step: number
  autoFocus?: boolean
  onChange: (n: number) => void
}): React.JSX.Element {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '')
  function set(t: string): void {
    setText(t)
    const n = Number.parseFloat(t)
    onChange(Number.isFinite(n) ? n : NaN)
  }
  return (
    <input
      className="input num-input"
      inputMode="decimal"
      aria-label="Value"
      data-autofocus={autoFocus || undefined}
      value={text}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const base = Number.isFinite(value) ? value : 0
        set(String(Math.round((base + (e.key === 'ArrowUp' ? step : -step)) * 100) / 100))
      }}
    />
  )
}

function ChoiceList({
  field,
  selected,
  postings,
  onChange
}: {
  field: ChoiceField
  selected: string[]
  postings: Posting[]
  onChange: (values: string[]) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const options = useMemo(() => optionsFor(field, postings), [field, postings])
  // Values picked earlier that this sheet doesn't have stay listed, so they can be unticked.
  const extra = selected
    .filter((v) => !options.some((o) => o.value === v))
    .map((v) => ({ value: v, name: choiceName(field, v), count: 0 }))
  const all = [...extra, ...options]
  const q = fold(query.trim())
  const shown = q ? all.filter((o) => fold(o.name).includes(q)) : all
  const searchable = all.length > 8

  function toggle(v: string): void {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }

  return (
    <div className="choice-list">
      {searchable && (
        <label className="menu-search">
          <Search size={14} />
          <input
            data-autofocus
            aria-label="Search values"
            placeholder={`Search ${all.length} values`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className="choice-options">
        {shown.slice(0, 200).map((o, i) => (
          <label key={`v:${o.value}`} className="choice-option">
            <input
              type="checkbox"
              data-autofocus={(!searchable && i === 0) || undefined}
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            <span className="choice-name" title={o.name}>
              {o.name}
            </span>
            <span className="choice-count">{o.count}</span>
          </label>
        ))}
        {!shown.length && <p className="menu-empty">Nothing matches.</p>}
        {shown.length > 200 && <p className="menu-empty">Type to narrow the list.</p>}
      </div>
    </div>
  )
}
