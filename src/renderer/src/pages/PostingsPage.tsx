import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterX, Inbox, Search } from 'lucide-react'
import {
  applyFilters,
  filterContext,
  fold,
  isActive,
  validConditions,
  type Condition
} from '../../../shared/filters'
import { SHEETS, sheetById } from '../../../shared/sheets'
import type { AppData, MyStatus, Posting } from '../../../shared/types'
import FilterBar from '../components/FilterBar'
import PostingDetail from '../components/PostingDetail'
import PostingTable from '../components/PostingTable'
import SheetPicker from '../components/SheetPicker'

interface Props {
  data: AppData | null
  onStatus: (id: string, status: MyStatus) => void
}

/** The open sheet and each sheet's filters, remembered between visits and restarts. */
interface Saved {
  sheetId: string
  filters: Record<string, Condition[]>
}

const STORAGE_KEY = 'scout.postings'
const NO_POSTINGS: Posting[] = []
const NO_CONDITIONS: Condition[] = []

function load(): Saved {
  const saved: Saved = { sheetId: SHEETS[0].id, filters: {} }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (SHEETS.some((s) => s.id === raw?.sheetId)) saved.sheetId = raw.sheetId
    for (const s of SHEETS) {
      const conditions = validConditions(raw?.filters?.[s.id])
      if (conditions.length) saved.filters[s.id] = conditions
    }
  } catch {
    // Unreadable or unavailable storage: start fresh.
  }
  return saved
}

function store(saved: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {
    // Not remembering the view is fine.
  }
}

/** Today's quick search: ID, title, organization, location or city. */
function findMatch(p: Posting, q: string): boolean {
  if (!q) return true
  const l = p.listing
  return [p.id, l.title, l.org, l.location, p.score?.city ?? ''].some((s) => fold(s).includes(q))
}

const EMPTY_TEXT: Record<string, string> = {
  near: 'Postings the AI read but rated just under the bar show up here.',
  inprog: 'Set a posting to Drafting or Applied, or apply on SCOPE, and it shows up here.'
}

export default function PostingsPage({ data, onStatus }: Props): React.JSX.Element {
  const [saved, setSaved] = useState(load)
  const [find, setFind] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dock = useRef<HTMLElement>(null)

  const postings = data?.postings ?? NO_POSTINGS
  const lastRun = data?.lastRun ?? null
  const sheet = sheetById(saved.sheetId)
  const conditions = saved.filters[sheet.id] ?? NO_CONDITIONS
  const q = fold(find.trim())

  const counts = useMemo(
    () => Object.fromEntries(SHEETS.map((s) => [s.id, postings.filter(s.test).length])),
    [postings]
  )
  const sheetRows = useMemo(() => postings.filter(sheet.test), [postings, sheet])
  const rows = useMemo(
    () =>
      applyFilters(sheetRows, conditions, filterContext(lastRun))
        .filter((p) => findMatch(p, q))
        .sort(sheet.sort),
    [sheetRows, conditions, lastRun, q, sheet]
  )
  const filtered = new Set(
    Object.entries(saved.filters)
      .filter(([, cs]) => cs.some(isActive))
      .map(([id]) => id)
  )
  const selected = selectedId ? (postings.find((p) => p.id === selectedId) ?? null) : null

  useEffect(() => {
    if (!selectedId) return
    // Each posting starts at its top.
    dock.current?.scrollTo(0, 0)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  function update(next: Saved): void {
    setSaved(next)
    store(next)
  }

  function setConditions(next: Condition[]): void {
    update({ ...saved, filters: { ...saved.filters, [sheet.id]: next } })
  }

  let body: React.JSX.Element
  if (!data) body = <p className="loading">Loading...</p>
  else if (rows.length)
    body = (
      <PostingTable
        rows={rows}
        kind={sheet.kind}
        lastRun={lastRun}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onStatus={onStatus}
      />
    )
  else if (sheetRows.length)
    body = (
      <div className="empty-state">
        <FilterX size={30} />
        <h3>No postings match</h3>
        <p>Nothing on this sheet fits your filters{q ? ' and search' : ''}.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setConditions([])
            setFind('')
          }}
        >
          Clear filters{q ? ' and search' : ''}
        </button>
      </div>
    )
  else
    body = (
      <div className="empty-state">
        <Inbox size={30} />
        <h3>Nothing here yet</h3>
        <p>{EMPTY_TEXT[sheet.kind] ?? 'Scan SCOPE and new picks show up here.'}</p>
      </div>
    )

  return (
    <main className="postings-page">
      <div className="toolbar">
        <div className="toolbar-row">
          <SheetPicker
            sheet={sheet}
            counts={counts}
            filtered={filtered}
            onChoose={(id) => update({ ...saved, sheetId: id })}
          />
          <span className="spacer" />
          <label className="find-box">
            <Search size={15} />
            <input
              type="search"
              placeholder="Find in this sheet"
              aria-label="Find in this sheet"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </label>
        </div>
        <div className="toolbar-row">
          <FilterBar conditions={conditions} onChange={setConditions} postings={sheetRows} />
          <span className="spacer" />
          {data && (
            <span className="showing">
              {rows.length === sheetRows.length ? (
                `${rows.length} ${rows.length === 1 ? 'posting' : 'postings'}`
              ) : (
                <>
                  Showing <b>{rows.length}</b> of {sheetRows.length}
                </>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="sheet-body">
        <div className="table-card">{body}</div>
        {selected && (
          <aside className="detail-dock" aria-label="Posting details" ref={dock}>
            <PostingDetail
              posting={selected}
              onClose={() => setSelectedId(null)}
              onStatus={onStatus}
            />
          </aside>
        )}
      </div>
    </main>
  )
}
