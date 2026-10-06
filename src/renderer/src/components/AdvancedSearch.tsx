import { useState } from 'react'
import {
  SEARCH_IN,
  formatQuery,
  fromForm,
  parseQuery,
  toForm,
  type QueryForm,
  type SearchField
} from '../../../shared/search'
import type { SearchState } from '../storage'

interface Props {
  query: string
  onQuery: (query: string) => void
  state: SearchState
  onState: (state: SearchState) => void
}

const BOXES: { key: 'all' | 'phrase' | 'any' | 'none'; label: string; example: string }[] = [
  { key: 'all', label: 'All of these words', example: 'python data' },
  { key: 'phrase', label: 'This exact phrase', example: 'machine learning' },
  { key: 'any', label: 'Any of these words', example: 'react vue angular' },
  { key: 'none', label: 'None of these words', example: 'senior manager' }
]

/**
 * Boxes that write the search query for you. The query in the search box and these boxes
 * follow each other, so what you type in one shows in the other.
 */
export default function AdvancedSearch({
  query,
  onQuery,
  state,
  onState
}: Props): React.JSX.Element {
  // While you type here, keep your exact text (spaces included) for as long as the search
  // box still holds the query this form made. Once the box changes, the form follows it.
  const [draft, setDraft] = useState<{ made: string; form: QueryForm } | null>(null)
  const form = draft && draft.made === query ? draft.form : toForm(parseQuery(query))
  const everywhere = form.scope.length === 0

  function edit(change: Partial<QueryForm>): void {
    const next = { ...form, ...change }
    const made = formatQuery(fromForm(next, parseQuery(query)))
    setDraft({ made, form: next })
    onQuery(made)
  }

  function toggleField(field: SearchField): void {
    const current = everywhere ? SEARCH_IN.map((s) => s.field) : form.scope
    const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
    // Searching nowhere makes no sense, and every box ticked means everywhere.
    if (!next.length) return
    edit({ scope: next.length === SEARCH_IN.length ? [] : next })
  }

  return (
    <section className="advanced card" aria-label="Advanced search">
      <div className="advanced-grid">
        {BOXES.map((b) => (
          <label key={b.key}>
            {b.label}
            <input
              className="input"
              value={form[b.key]}
              placeholder={b.example}
              spellCheck={false}
              onChange={(e) => edit({ [b.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="advanced-row">
        <span className="advanced-label">Search in</span>
        {SEARCH_IN.map(({ field, label }) => (
          <label key={field} className="check">
            <input
              type="checkbox"
              checked={everywhere || form.scope.includes(field)}
              onChange={() => toggleField(field)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="advanced-row">
        <span className="advanced-label">Include</span>
        <label className="check">
          <input
            type="checkbox"
            checked={state.includeClosed}
            onChange={(e) => onState({ ...state, includeClosed: e.target.checked })}
          />
          Closed postings
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={state.includeGone}
            onChange={(e) => onState({ ...state, includeGone: e.target.checked })}
          />
          Postings no longer on SCOPE
        </label>
      </div>
      <p className="advanced-hint">
        The search box shows the query these boxes make, so next time you can type it straight in.
      </p>
    </section>
  )
}
