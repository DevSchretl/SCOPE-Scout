import { useEffect, useState } from 'react'
import type {
  AppData,
  MyStatus,
  Posting,
  ProviderId,
  ScopeStatus,
  SettingsView
} from '../../shared/types'
import PostingDetail from './components/PostingDetail'
import Settings from './components/Settings'
import TopNav, { type View } from './components/TopNav'
import HomePage from './pages/HomePage'
import PostingsPage from './pages/PostingsPage'
import RunsPage from './pages/RunsPage'

/** Ctrl+1, 2 and 3 switch pages. */
const NAV_KEYS: Record<string, View> = { '1': 'home', '2': 'postings', '3': 'runs' }

/** A posting opened from Home or Past runs slides in over the page. */
function Drawer({
  posting,
  onClose,
  onStatus
}: {
  posting: Posting
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
        <PostingDetail posting={posting} onClose={onClose} onStatus={onStatus} />
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function navigate(next: View): void {
    setView(next)
    setDrawerId(null)
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
      {view === 'postings' && <PostingsPage data={data} onStatus={changeStatus} />}
      {view === 'runs' && <RunsPage runs={data?.runs ?? []} onOpenPosting={setDrawerId} />}

      {drawerPosting && (
        <Drawer posting={drawerPosting} onClose={() => setDrawerId(null)} onStatus={changeStatus} />
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
