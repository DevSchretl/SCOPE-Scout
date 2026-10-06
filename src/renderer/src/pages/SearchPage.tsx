import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  Building2,
  Check,
  Clock,
  Hash,
  MapPin,
  Search,
  SearchX,
  SlidersHorizontal
} from 'lucide-react'
import { isNewIn, postingMatch } from '../../../shared/derive'
import { applyFilters, filterContext, isActive } from '../../../shared/filters'
import {
  SEARCH_TIPS,
  SORTS,
  formatQuery,
  isEmptyQuery,
  marksFor,
  parseQuery,
  searchPostings,
  snippetOf,
  type Mark,
  type SearchResult
} from '../../../shared/search'
import type { AppData, MyStatus, Posting, RunRecord } from '../../../shared/types'
import AdvancedSearch from '../components/AdvancedSearch'
import { Closes, MatchBadge, NewBadge, StatusTag } from '../components/Badges'
import FilterBar from '../components/FilterBar'
import Highlight from '../components/Highlight'
import Popover from '../components/Popover'
import PostingDetail from '../components/PostingDetail'
import type { SearchState } from '../storage'

interface Props {
  data: AppData | null
  query: string
  onQuery: (query: string) => void
  state: SearchState
  onState: (state: SearchState) => void
  recent: string[]
  onStatus: (id: string, status: MyStatus) => void
}

/** Results show in pages of this many. */
const PAGE = 40
const NO_POSTINGS: Posting[] = []

function ResultCard({
  result,
  marks,
  lastRun,
  selected,
  onSelect
}: {
  result: SearchResult
  marks: Mark[]
  lastRun: RunRecord | null
  selected: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  const p = result.posting
  const snippet = useMemo(() => snippetOf(p, marks), [p, marks])
  const classes = ['result-card', selected ? 'selected' : '', result.open ? '' : 'faded']
  return (
    <button
      type="button"
      className={classes.join(' ').trim()}
      aria-pressed={selected}
      onClick={() => onSelect(p.id)}
    >
      <MatchBadge value={postingMatch(p)} />
      <span className="result-main">
        <span className="result-title">
          {isNewIn(p, lastRun) && <NewBadge />}
          <Highlight text={p.listing.title} marks={marks} />
        </span>
        <span className="result-meta">
          <span>
            <Building2 size={13} />
            <span>
              <Highlight text={p.listing.org} marks={marks} />
            </span>
          </span>
          <span>
            <MapPin size={13} />
            <span>
              <Highlight text={p.listing.location} marks={marks} />
            </span>
          </span>
          <span>
            <Hash size={13} />
            <span>
              <Highlight text={p.id} marks={marks} />
            </span>
          </span>
          <span>{p.term}</span>
        </span>
        {snippet && (
          <span className="result-snippet">
            <Highlight text={snippet} marks={marks} />
          </span>
        )}
      </span>
      <span className="result-side">
        <Closes deadline={p.listing.deadline} />
        <StatusTag status={p.myStatus} />
        {!p.onScopeNow && <span className="tag muted">Gone from SCOPE</span>}
      </span>
    </button>
  )
}

export default function SearchPage({
  data,
  query,
  onQuery,
  state,
  onState,
  recent,
  onStatus
}: Props): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortOpen, setSortOpen] = useState(false)
  // How many results to show, for the results it was set on.
  const [more, setMore] = useState({ key: '', count: PAGE })
  const dock = useRef<HTMLElement>(null)

  const deferred = useDeferredValue(query)
  const postings = data?.postings ?? NO_POSTINGS
  const lastRun = data?.lastRun ?? null
  const { conditions, sort, includeClosed, includeGone } = state
  const parsed = useMemo(() => parseQuery(deferred), [deferred])
  const marks = useMemo(() => marksFor(parsed), [parsed])
  const filtered = useMemo(
    () => applyFilters(postings, conditions, filterContext(lastRun)),
    [postings, conditions, lastRun]
  )
  const { results, hidden } = useMemo(
    () => searchPostings(filtered, parsed, { sort, includeClosed, includeGone }),
    [filtered, parsed, sort, includeClosed, includeGone]
  )

  const filtersOn = conditions.some(isActive)
  const blank = isEmptyQuery(parsed) && !filtersOn
  const key = `${deferred}|${sort}|${includeClosed}|${includeGone}|${JSON.stringify(conditions)}`
  const limit = more.key === key ? more.count : PAGE
  const shown = results.slice(0, limit)
  const closedCount = results.filter((r) => !r.open).length
  const selected = selectedId ? (postings.find((p) => p.id === selectedId) ?? null) : null
  const includeAll = (): void => onState({ ...state, includeClosed: true, includeGone: true })

  useEffect(() => {
    if (!selectedId) return
    dock.current?.scrollTo(0, 0)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  let body: React.JSX.Element
  if (!data) body = <p className="loading">Loading...</p>
  else if (blank)
    body = (
      <div className="search-prompt">
        <div className="empty-state">
          <Search size={30} />
          <h3>Search every posting</h3>
          <p>
            Type in the search box at the top. Ctrl+K takes you there from any page. You can also
            search with filters alone.
          </p>
        </div>
        <div className="tips-grid wide">
          {SEARCH_TIPS.map((t) => (
            <button key={t.query} type="button" className="tip" onClick={() => onQuery(t.query)}>
              <code>{t.query}</code>
              <span>{t.finds}</span>
            </button>
          ))}
        </div>
        {recent.length > 0 && (
          <div className="recent-list">
            <h4>Recent searches</h4>
            {recent.map((q) => (
              <button key={q} type="button" className="recent-item" onClick={() => onQuery(q)}>
                <Clock size={14} />
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  else if (!results.length)
    body = (
      <div className="empty-state">
        <SearchX size={30} />
        <h3>No postings match</h3>
        <p>Check the spelling, or try fewer words.</p>
        <div className="empty-actions">
          {hidden > 0 && (
            <button type="button" className="btn" onClick={includeAll}>
              Include {hidden} closed or gone
            </button>
          )}
          {filtersOn && (
            <button
              type="button"
              className="btn"
              onClick={() => onState({ ...state, conditions: [] })}
            >
              Clear filters
            </button>
          )}
          {parsed.scope.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => onQuery(formatQuery({ ...parsed, scope: [] }))}
            >
              Search all fields
            </button>
          )}
        </div>
      </div>
    )
  else
    body = (
      <div className="result-list">
        {shown.map((r, i) => (
          <Fragment key={r.posting.id}>
            {!r.open && (i === 0 || shown[i - 1].open) && (
              <div className="results-divider">Closed or no longer on SCOPE · {closedCount}</div>
            )}
            <ResultCard
              result={r}
              marks={marks}
              lastRun={lastRun}
              selected={r.posting.id === selectedId}
              onSelect={setSelectedId}
            />
          </Fragment>
        ))}
        {results.length > shown.length && (
          <button
            type="button"
            className="btn show-more"
            onClick={() => setMore({ key, count: limit + PAGE })}
          >
            Show {Math.min(PAGE, results.length - shown.length)} more of{' '}
            {results.length - shown.length}
          </button>
        )}
      </div>
    )

  return (
    <main className="search-page">
      <div className="search-head">
        <div className="search-title">
          <h1>
            {blank ? 'Search' : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </h1>
          {!blank && deferred.trim() && (
            <span className="search-for">
              for <span className="query-pill">{deferred.trim()}</span>
            </span>
          )}
          {!blank && hidden > 0 && (
            <span className="search-note">
              {hidden} closed or gone hidden.{' '}
              <button type="button" className="link-btn" onClick={includeAll}>
                Show them
              </button>
            </span>
          )}
        </div>
        <div className="search-tools">
          <FilterBar
            conditions={conditions}
            onChange={(next) => onState({ ...state, conditions: next })}
            postings={postings}
          />
          <span className="spacer" />
          <Popover
            open={sortOpen}
            onOpenChange={(o) => setSortOpen(o)}
            align="end"
            panelClass="sort-menu"
            title="Sort results"
            label={
              <>
                <ArrowDownUp size={15} />
                {SORTS.find((s) => s.key === sort)?.label}
              </>
            }
          >
            <div className="menu-label">Sort by</div>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="menuitemradio"
                aria-checked={s.key === sort}
                className="menu-item"
                onClick={() => {
                  onState({ ...state, sort: s.key })
                  setSortOpen(false)
                }}
              >
                {s.label}
                <Check size={16} className="check" />
              </button>
            ))}
          </Popover>
          <button
            type="button"
            className={state.advanced ? 'btn toggled' : 'btn'}
            aria-expanded={state.advanced}
            onClick={() => onState({ ...state, advanced: !state.advanced })}
          >
            <SlidersHorizontal size={15} />
            Advanced
          </button>
        </div>
        {state.advanced && (
          <AdvancedSearch query={query} onQuery={onQuery} state={state} onState={onState} />
        )}
      </div>

      <div className="search-body">
        <div className="results">{body}</div>
        {selected && (
          <aside className="detail-dock" aria-label="Posting details" ref={dock}>
            <PostingDetail
              posting={selected}
              marks={marks}
              onClose={() => setSelectedId(null)}
              onStatus={onStatus}
            />
          </aside>
        )}
      </div>
    </main>
  )
}
