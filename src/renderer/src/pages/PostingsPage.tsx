import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterX, Inbox } from 'lucide-react'
import {
  SHEET_FIELDS,
  applyFilters,
  filterContext,
  isActive,
  type Condition
} from '../../../shared/filters'
import { SHEETS, sheetById } from '../../../shared/sheets'
import type { AppData, MyStatus, Posting } from '../../../shared/types'
import FilterBar from '../components/FilterBar'
import PostingDetail from '../components/PostingDetail'
import PostingTable from '../components/PostingTable'
import SheetPicker from '../components/SheetPicker'
import type { PostingsView } from '../storage'

interface Props {
  data: AppData | null
  /** The open sheet and each sheet's filters (kept by App, so search can add to them). */
  view: PostingsView
  onView: (view: PostingsView) => void
  onStatus: (id: string, status: MyStatus) => void
}

const NO_POSTINGS: Posting[] = []
const NO_CONDITIONS: Condition[] = []

const EMPTY_TEXT: Record<string, string> = {
  near: 'Postings the AI read but rated just under the bar show up here.',
  inprog: 'Set a posting to Drafting or Applied, or apply on SCOPE, and it shows up here.'
}

export default function PostingsPage({ data, view, onView, onStatus }: Props): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dock = useRef<HTMLElement>(null)

  const postings = data?.postings ?? NO_POSTINGS
  const lastRun = data?.lastRun ?? null
  const sheet = sheetById(view.sheetId)
  const conditions = view.filters[sheet.id] ?? NO_CONDITIONS

  const counts = useMemo(
    () => Object.fromEntries(SHEETS.map((s) => [s.id, postings.filter(s.test).length])),
    [postings]
  )
  const sheetRows = useMemo(() => postings.filter(sheet.test), [postings, sheet])
  const rows = useMemo(
    () => applyFilters(sheetRows, conditions, filterContext(lastRun)).sort(sheet.sort),
    [sheetRows, conditions, lastRun, sheet]
  )
  const filtered = new Set(
    Object.entries(view.filters)
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

  function setConditions(next: Condition[]): void {
    onView({ ...view, filters: { ...view.filters, [sheet.id]: next } })
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
        <p>Nothing on this sheet fits your filters.</p>
        <button type="button" className="btn" onClick={() => setConditions([])}>
          Clear filters
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
            onChoose={(id) => onView({ ...view, sheetId: id })}
          />
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
        <div className="toolbar-row">
          <FilterBar
            conditions={conditions}
            onChange={setConditions}
            postings={sheetRows}
            fields={SHEET_FIELDS}
          />
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
