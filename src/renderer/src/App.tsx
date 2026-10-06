import { useEffect, useMemo, useState } from 'react'
import { marksFor, parseQuery, type Mark } from '../../shared/search'
import { sheetById } from '../../shared/sheets'
import type {
  AppData,
  MyStatus,
  Posting,
  ProviderId,
  ScopeStatus,
  SettingsView
} from '../../shared/types'
import PostingDetail from './components/PostingDetail'
import SearchBar from './components/SearchBar'
import Settings from './components/Settings'
import TopNav, { type View } from './components/TopNav'
import HomePage from './pages/HomePage'
import PostingsPage from './pages/PostingsPage'
import RunsPage from './pages/RunsPage'
import SearchPage from './pages/SearchPage'
import {
  MAX_RECENT,
  POSTINGS_KEY,
  RECENT_KEY,
  SEARCH_KEY,
  parsePostingsView,
  parseRecent,
  parseSearchState,
  useStored
} from './storage'

/** Ctrl+1, 2 and 3 switch pages. */
const NAV_KEYS: Record<string, View> = { '1': 'home', '2': 'postings', '3': 'runs' }
const NO_POSTINGS: Posting[] = []

/** A posting opened from Home, Past runs or the search box slides in over the page. */
function Drawer({
  posting,
  marks,
  onClose,
  onStatus
}: {
  posting: Posting
  marks: Mark[]
  onClose: () => void
  onStatus: (id: string, status: MyStatus) => void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={posting.listing.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <PostingDetail posting={posting} marks={marks} onClose={onClose} onStatus={onStatus} />
      </aside>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [data, setData] = useState<AppData | null>(null)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState('')
  const [scope, setScope] = useState<ScopeStatus>('checking')
  const [view, setView] = useState<View>('home')
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  // What's in the search box. The Search page shows results for it.
  const [query, setQuery] = useState('')
  const [postingsView, setPostingsView] = useStored(POSTINGS_KEY, parsePostingsView)
  const [searchState, setSearchState] = useStored(SEARCH_KEY, parseSearchState)
  const [recent, setRecent] = useStored(RECENT_KEY, parseRecent)
  const drawerMarks = useMemo(() => marksFor(parseQuery(query)), [query])

  useEffect(() => {
    const load = async (): Promise<void> => {
      const d = await window.api.getData()
      setData(d)
      setScanning(d.scanning)
    }
    void load()
    void window.api.getSettings().then(setSettings)
    void window.api.checkScope().then(setScope)
    const offs = [
      window.api.onProgress(setProgress),
      window.api.onScopeStatus(setScope),
      window.api.onScanDone(() => {
        setScanning(false)
        setProgress('')
        void load()
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || !Object.hasOwn(NAV_KEYS, e.key))
        return
      e.preventDefault()
      setView(NAV_KEYS[e.key])
      setDrawerId(null)
      setQuery('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function navigate(next: View): void {
    setView(next)
    setDrawerId(null)
    // The search box belongs to the Search page; other pages start with it empty.
    if (next !== 'search') setQuery('')
  }

  function search(q: string): void {
    const text = q.trim()
    if (text) setRecent([text, ...recent.filter((r) => r !== text)].slice(0, MAX_RECENT))
    setQuery(q)
    setView('search')
    setDrawerId(null)
  }

  function openAdvanced(): void {
    setSearchState({ ...searchState, advanced: true })
    setView('search')
    setDrawerId(null)
  }

  /** Adds the words in the search box as a Keywords filter on the open sheet. */
  function filterSheet(text: string): void {
    const id = postingsView.sheetId
    const conditions = postingsView.filters[id] ?? []
    setPostingsView({
      ...postingsView,
      filters: {
        ...postingsView.filters,
        [id]: [...conditions, { field: 'keywords', op: 'contains', value: text }]
      }
    })
    setQuery('')
  }

  async function scan(): Promise<void> {
    const res = await window.api.startScan()
    if (res.started) {
      setScanning(true)
      setProgress('Starting...')
    } else setProgress(res.reason ?? '')
  }

  async function changeStatus(id: string, status: MyStatus): Promise<void> {
    await window.api.setStatus(id, status)
    setData(
      (d) =>
        d && {
          ...d,
          postings: d.postings.map((p) => (p.id === id ? { ...p, myStatus: status } : p))
        }
    )
  }

  async function chooseProvider(id: ProviderId): Promise<void> {
    try {
      setSettings(await window.api.saveSettings({ provider: id }))
    } catch (e) {
      setProgress(`Could not switch the AI provider: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const drawerPosting = drawerId ? (data?.postings.find((p) => p.id === drawerId) ?? null) : null

  return (
    <div className={showSettings ? 'app modal-open' : 'app'}>
      <TopNav
        view={view}
        onNavigate={navigate}
        scanning={scanning}
        progress={progress}
        scope={scope}
        onOpenScope={() => window.api.openScope()}
        onOpenSettings={() => setShowSettings(true)}
        search={
          <SearchBar
            query={query}
            onQuery={setQuery}
            onSubmit={search}
            onOpenPosting={setDrawerId}
            onAdvanced={openAdvanced}
            onFilterSheet={view === 'postings' ? filterSheet : undefined}
            sheetLabel={sheetById(postingsView.sheetId).label}
            postings={data?.postings ?? NO_POSTINGS}
            recent={recent}
            onClearRecent={() => setRecent([])}
            onSearchPage={view === 'search'}
          />
        }
      />

      {view === 'home' && (
        <HomePage
          data={data}
          settings={settings}
          scanning={scanning}
          progress={progress}
          scope={scope}
          onScan={scan}
          onOpenScope={() => window.api.openScope()}
          onOpenSettings={() => setShowSettings(true)}
          onChooseProvider={chooseProvider}
          onOpenPosting={setDrawerId}
          onSeeRuns={() => navigate('runs')}
        />
      )}
      {view === 'postings' && (
        <PostingsPage
          data={data}
          view={postingsView}
          onView={setPostingsView}
          onStatus={changeStatus}
        />
      )}
      {view === 'runs' && <RunsPage runs={data?.runs ?? []} onOpenPosting={setDrawerId} />}
      {view === 'search' && (
        <SearchPage
          data={data}
          query={query}
          onQuery={setQuery}
          state={searchState}
          onState={setSearchState}
          recent={recent}
          onStatus={changeStatus}
        />
      )}

      {drawerPosting && (
        <Drawer
          posting={drawerPosting}
          marks={drawerMarks}
          onClose={() => setDrawerId(null)}
          onStatus={changeStatus}
        />
      )}
      {showSettings && settings && (
        <Settings
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(saved) => {
            setSettings(saved)
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}
