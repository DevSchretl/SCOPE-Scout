import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Building2,
  Clock,
  CornerDownLeft,
  ListFilter,
  MapPin,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { postingMatch } from '../../../shared/derive'
import {
  SEARCH_TIPS,
  countValues,
  marksFor,
  parseQuery,
  searchPostings,
  suggestValues
} from '../../../shared/search'
import type { Posting } from '../../../shared/types'
import { Closes, MatchBadge } from './Badges'
import Highlight from './Highlight'

type Item =
  | { kind: 'posting'; posting: Posting; open: boolean }
  | { kind: 'all'; count: number }
  | { kind: 'org' | 'city'; value: string; count: number }
  | { kind: 'sheet' }
  | { kind: 'recent'; query: string }
  | { kind: 'advanced' }

const SECTIONS: Partial<Record<Item['kind'], string>> = {
  posting: 'Postings',
  org: 'Organizations',
  city: 'Locations',
  recent: 'Recent searches'
}

const PANEL_ID = 'search-panel'
const POSTING_ROWS = 6

interface Props {
  query: string
  onQuery: (query: string) => void
  /** Opens the Search page with this query. */
  onSubmit: (query: string) => void
  onOpenPosting: (id: string) => void
  onAdvanced: () => void
  /** Adds the text as a Keywords filter on the open sheet (Postings page only). */
  onFilterSheet?: (text: string) => void
  sheetLabel?: string
  postings: Posting[]
  recent: string[]
  onClearRecent: () => void
  /** On the Search page the box drives the page, so there is no panel. */
  onSearchPage: boolean
}

/** The search box in the nav bar, with results as you type. */
export default function SearchBar({
  query,
  onQuery,
  onSubmit,
  onOpenPosting,
  onAdvanced,
  onFilterSheet,
  sheetLabel,
  postings,
  recent,
  onClearRecent,
  onSearchPage
}: Props): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  // Esc and choices hide the panel until you type again.
  const [dismissed, setDismissed] = useState(false)
  const [activeFor, setActiveFor] = useState({ query: '', index: -1 })
  const deferred = useDeferredValue(query)
  const text = deferred.trim()
  const parsed = useMemo(() => parseQuery(deferred), [deferred])
  const marks = useMemo(() => marksFor(parsed), [parsed])
  const orgs = useMemo(() => countValues(postings, (p) => p.listing.org), [postings])
  const cities = useMemo(() => countValues(postings, (p) => p.listing.location), [postings])
  const canFilterSheet = !!onFilterSheet

  const items = useMemo((): Item[] => {
    if (!text)
      return [
        ...recent.slice(0, 6).map((q): Item => ({ kind: 'recent', query: q })),
        { kind: 'advanced' }
      ]
    const { results } = searchPostings(postings, parsed)
    return [
      ...results
        .slice(0, POSTING_ROWS)
        .map((r): Item => ({ kind: 'posting', posting: r.posting, open: r.open })),
      { kind: 'all', count: results.length },
      ...suggestValues(orgs, parsed).map((s): Item => ({ kind: 'org', ...s })),
      ...suggestValues(cities, parsed).map((s): Item => ({ kind: 'city', ...s })),
      ...(canFilterSheet ? [{ kind: 'sheet' } as const] : []),
      { kind: 'advanced' }
    ]
  }, [text, recent, postings, parsed, orgs, cities, canFilterSheet])

  const active = activeFor.query === deferred ? activeFor.index : -1
  const open = focused && !dismissed && !onSearchPage

  // Ctrl+K anywhere, or / when you aren't typing in a field, jumps to the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const inField =
        e.target instanceof Element &&
        !!e.target.closest('input, textarea, select, [contenteditable="true"]')
      const ctrlK = e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'
      const slash = e.key === '/' && !inField && !e.ctrlKey && !e.altKey && !e.metaKey
      if (!ctrlK && !slash) return
      e.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(q: string): void {
    setDismissed(true)
    onSubmit(q)
  }

  function activate(item: Item | undefined): void {
    if (!item || item.kind === 'all') return submit(query)
    if (item.kind === 'org' || item.kind === 'city')
      return submit(`${item.kind}:"${item.value.replace(/"/g, '')}"`)
    if (item.kind === 'recent') return submit(item.query)
    setDismissed(true)
    if (item.kind === 'posting') onOpenPosting(item.posting.id)
    else if (item.kind === 'sheet') onFilterSheet?.(query.trim())
    else onAdvanced()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (onSearchPage) return
      e.preventDefault()
      if (!open) return setDismissed(false)
      const n = items.length
      const index = e.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1
      setActiveFor({ query: deferred, index })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (onSearchPage) onSubmit(query)
      else activate(open ? items[active] : undefined)
    } else if (e.key === 'Escape') {
      if (open) {
        // Only close the panel, not a posting behind it.
        e.stopPropagation()
        setDismissed(true)
      } else input.current?.blur()
    }
  }

  function row(item: Item, i: number): React.JSX.Element {
    const attrs = {
      id: `sr-${i}`,
      type: 'button' as const,
      role: 'option',
      'aria-selected': i === active,
      className: `sr-item${i === active ? ' active' : ''}`,
      onClick: () => activate(item)
    }
    switch (item.kind) {
      case 'posting': {
        const p = item.posting
        return (
          <button {...attrs} className={`${attrs.className}${item.open ? '' : ' faded'}`}>
            <MatchBadge value={postingMatch(p)} />
            <span className="sr-text">
              <span className="sr-title">
                <Highlight text={p.listing.title} marks={marks} />
              </span>
              <span className="sr-sub">
                <Highlight text={p.listing.org} marks={marks} /> ·{' '}
                <Highlight text={p.listing.location} marks={marks} />
              </span>
            </span>
            <Closes deadline={p.listing.deadline} />
          </button>
        )
      }
      case 'all':
        return (
          <button {...attrs}>
            <ArrowRight size={16} className="type-icon" />
            <span className="sr-text sr-strong">
              {item.count
                ? `See all ${item.count} ${item.count === 1 ? 'result' : 'results'}`
                : 'No postings match. Open the Search page'}
            </span>
            <span className="kbd light">
              <CornerDownLeft size={11} /> Enter
            </span>
          </button>
        )
      case 'org':
      case 'city': {
        const Icon = item.kind === 'org' ? Building2 : MapPin
        return (
          <button {...attrs}>
            <Icon size={16} className="type-icon" />
            <span className="sr-text">
              <span className="sr-title">
                <Highlight text={item.value} marks={marks} />
              </span>
              <span className="sr-sub">
                {item.kind === 'org' ? 'Organization' : 'Location'} · {item.count}{' '}
                {item.count === 1 ? 'posting' : 'postings'}
              </span>
            </span>
          </button>
        )
      }
      case 'sheet':
        return (
          <button {...attrs}>
            <ListFilter size={16} className="type-icon" />
            <span className="sr-text">
              Filter {sheetLabel ?? 'this sheet'} by &quot;{text}&quot;
            </span>
          </button>
        )
      case 'recent':
        return (
          <button {...attrs}>
            <Clock size={16} className="type-icon" />
            <span className="sr-text">{item.query}</span>
          </button>
        )
      case 'advanced':
        return (
          <button {...attrs} className={`${attrs.className} sr-foot`}>
            <SlidersHorizontal size={16} className="type-icon" />
            <span className="sr-text">Advanced search</span>
          </button>
        )
    }
  }

  return (
    <div className={onSearchPage ? 'nav-search on-page' : 'nav-search'}>
      <div className="nav-search-box">
        <Search size={15} />
        <input
          ref={input}
          value={query}
          placeholder="Search postings"
          spellCheck={false}
          role="combobox"
          aria-label="Search postings"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `sr-${active}` : undefined}
          onChange={(e) => {
            onQuery(e.target.value)
            setDismissed(false)
          }}
          onFocus={() => {
            setFocused(true)
            setDismissed(false)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="nav-search-clear"
            aria-label="Clear search"
            title="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onQuery('')
              input.current?.focus()
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <span className="kbd">Ctrl K</span>
        )}
      </div>

      {open && (
        <div
          id={PANEL_ID}
          className="search-panel"
          role="listbox"
          aria-label="Search results"
          // Clicks inside keep the focus in the box, so the panel stays open until a choice.
          onMouseDown={(e) => e.preventDefault()}
        >
          {!text && (
            <>
              <div className="menu-label">
                Search by title, organization, city, job ID or any word
              </div>
              <div className="tips-grid">
                {SEARCH_TIPS.map((t) => (
                  <button
                    key={t.query}
                    type="button"
                    className="tip"
                    onClick={() => onQuery(t.query)}
                  >
                    <code>{t.query}</code>
                    <span>{t.finds}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {items.map((item, i) => {
            const section = SECTIONS[item.kind]
            const first = section && items[i - 1]?.kind !== item.kind
            return (
              <div key={`${item.kind}-${i}`}>
                {first && (
                  <div className="sr-section">
                    {section}
                    {item.kind === 'recent' && (
                      <button type="button" className="link-btn" onClick={onClearRecent}>
                        Clear
                      </button>
                    )}
                  </div>
                )}
                {item.kind === 'advanced' && <div className="menu-sep" />}
                {row(item, i)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
