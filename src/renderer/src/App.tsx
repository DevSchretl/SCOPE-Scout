import { useEffect, useMemo, useState } from 'react'
import { QUICK_SEARCHES } from '../../shared/config'
import { comparePicks, sectionOf } from '../../shared/derive'
import type { AppData, MyStatus, Posting, ScopeStatus, SettingsView } from '../../shared/types'
import PostingDetail from './components/PostingDetail'
import PostingTable, { type TableKind } from './components/PostingTable'
import RunSummary from './components/RunSummary'
import Settings from './components/Settings'
import { formatDateTime } from './format'

interface Tab {
  id: string
  label: string
  kind: TableKind
  filter: (p: Posting) => boolean
  sort: (a: Posting, b: Posting) => number
}

const termOrder = (p: Posting): number => {
  const i = QUICK_SEARCHES.findIndex((q) => q.term === p.term)
  return i < 0 ? 99 : i
}
const byDeadline = (a: Posting, b: Posting): number =>
  (a.listing.deadline ?? '9999').localeCompare(b.listing.deadline ?? '9999')

// Same tabs as the old workbook. Search covers the old RBC tab.
const TABS: Tab[] = [
  ...QUICK_SEARCHES.map((qs): Tab => ({
    id: `pick-${qs.term}`,
    label: qs.label,
    kind: 'picks',
    filter: (p) => sectionOf(p) === 'pick' && p.term === qs.term,
    sort: comparePicks
  })),
  {
    id: 'near',
    label: 'Near misses',
    kind: 'near',
    filter: (p) => sectionOf(p) === 'near',
    sort: (a, b) => (b.score?.scoredAt ?? '').localeCompare(a.score?.scoredAt ?? '')
  },
  {
    id: 'inprog',
    label: 'In progress',
    kind: 'inprog',
    filter: (p) => sectionOf(p) === 'inprog',
    sort: (a, b) => a.listing.org.localeCompare(b.listing.org) || byDeadline(a, b)
  },
  {
    id: 'all',
    label: 'All postings',
    kind: 'all',
    filter: () => true,
    sort: (a, b) => termOrder(a) - termOrder(b) || byDeadline(a, b)
  }
]

const SCOPE_LABEL: Record<ScopeStatus, string> = {
  unknown: 'SCOPE: not checked',
  checking: 'SCOPE: checking...',
  'logged-in': 'SCOPE: logged in',
  'login-needed': 'SCOPE: login needed',
  error: 'SCOPE: unreachable'
}

function matches(p: Posting, q: string): boolean {
  if (!q) return true
  const l = p.listing
  return [p.id, l.title, l.org, l.location, p.score?.city ?? ''].some((s) =>
    s.toLowerCase().includes(q)
  )
}

export default function App(): React.JSX.Element {
  const [data, setData] = useState<AppData | null>(null)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState('')
  const [scope, setScope] = useState<ScopeStatus>('checking')
  const [tabId, setTabId] = useState(TABS[0].id)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSummary, setShowSummary] = useState(true)

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
        setShowSummary(true)
        void load()
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]
  const q = query.trim().toLowerCase()
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, data?.postings.filter(t.filter).length ?? 0])),
    [data]
  )
  const rows = useMemo(
    () => (data?.postings ?? []).filter((p) => tab.filter(p) && matches(p, q)).sort(tab.sort),
    [data, tab, q]
  )
  const selected = data?.postings.find((p) => p.id === selectedId) ?? null

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

  function select(id: string): void {
    setSelectedId(id)
    setQuery('')
    const p = data?.postings.find((x) => x.id === id)
    const home = p && TABS.find((t) => t.filter(p) && t.id !== 'all')
    setTabId(home ? home.id : 'all')
  }

  const lastRun = data?.lastRun ?? null
  const needsSetup = settings && (!settings.hasKey || !settings.profile.trim())

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">SCOPE Scout</span>
        <button className="primary" onClick={scan} disabled={scanning || !!needsSetup}>
          {scanning ? 'Scanning...' : 'Scan now'}
        </button>
        <span className="progress">{progress}</span>
        <span className="spacer" />
        {lastRun && <span className="muted">Last scan {formatDateTime(lastRun.finishedAt)}</span>}
        <span className={`scope-chip ${scope}`}>{SCOPE_LABEL[scope]}</span>
        <button onClick={() => window.api.openScope()} disabled={scanning}>
          Open SCOPE
        </button>
        <button onClick={() => setShowSettings(true)}>Settings</button>
      </header>

      {needsSetup && (
        <div className="banner">
          Add your Claude API key and profile in Settings to start scanning.{' '}
          <button className="link" onClick={() => setShowSettings(true)}>
            Open Settings
          </button>
        </div>
      )}
      {scope === 'login-needed' && !scanning && (
        <div className="banner">
          SCOPE needs you to log in.{' '}
          <button className="link" onClick={() => window.api.openScope()}>
            Open SCOPE
          </button>{' '}
          and sign in with your CWL, then close that window.
        </div>
      )}
      {showSummary && lastRun && (
        <RunSummary run={lastRun} onSelect={select} onClose={() => setShowSummary(false)} />
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab.id ? 'active' : ''}
            onClick={() => setTabId(t.id)}
          >
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
        <input
          type="search"
          placeholder="Search title, organization, city or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </nav>

      <main className={selected ? 'content with-detail' : 'content'}>
        <div className="table-wrap">
          {data ? (
            <PostingTable
              rows={rows}
              kind={tab.kind}
              lastRun={lastRun}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onStatus={changeStatus}
            />
          ) : (
            <p className="empty">Loading...</p>
          )}
        </div>
        {selected && (
          <PostingDetail
            posting={selected}
            onClose={() => setSelectedId(null)}
            onStatus={changeStatus}
          />
        )}
      </main>

      {showSettings && settings && (
        <Settings
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(view) => {
            setSettings(view)
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}
