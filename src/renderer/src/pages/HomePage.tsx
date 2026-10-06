import {
  ArrowRight,
  ExternalLink,
  LoaderCircle,
  Radar,
  ScanSearch,
  TriangleAlert
} from 'lucide-react'
import type {
  AppData,
  ProviderId,
  RunStatus,
  ScopeStatus,
  SettingsView
} from '../../../shared/types'
import ProviderPicker from '../components/ProviderPicker'
import RunCard from '../components/RunCard'
import { SCOPE_TEXT, formatDateTime, formatRelative } from '../format'

interface Props {
  data: AppData | null
  settings: SettingsView | null
  scanning: boolean
  progress: string
  scope: ScopeStatus
  onScan: () => void
  onOpenScope: () => void
  onOpenSettings: () => void
  onChooseProvider: (id: ProviderId) => void
  onOpenPosting: (id: string) => void
  onSeeRuns: () => void
}

const RUN_STATUS: Record<RunStatus, string> = {
  done: 'finished',
  'login-needed': 'SCOPE login needed',
  error: 'stopped with an error'
}

export default function HomePage({
  data,
  settings,
  scanning,
  progress,
  scope,
  onScan,
  onOpenScope,
  onOpenSettings,
  onChooseProvider,
  onOpenPosting,
  onSeeRuns
}: Props): React.JSX.Element {
  const lastRun = data?.lastRun ?? null
  const problem = settings?.problem ?? ''
  const loginNeeded = scope === 'login-needed' && !scanning

  return (
    <main className="page">
      <div className="page-inner">
        <section className="hero">
          <div className="hero-top">
            <div>
              <div className="hero-eyebrow">UBC Science Co-op</div>
              <h1>Find your next co-op</h1>
              <p className="hero-sub">
                {lastRun
                  ? `Last scan ${formatDateTime(lastRun.finishedAt)} · ${RUN_STATUS[lastRun.status]} · ${formatRelative(lastRun.finishedAt)}`
                  : 'No scans yet.'}
              </p>
            </div>
            <span className="scope-status" data-status={scope}>
              <span className="dot" />
              {SCOPE_TEXT[scope]}
            </span>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              className="btn gold lg"
              onClick={onScan}
              disabled={scanning || !!problem}
            >
              {scanning ? <LoaderCircle size={18} className="spin" /> : <ScanSearch size={18} />}
              {scanning ? 'Scanning...' : 'Scan now'}
            </button>
            <button
              type="button"
              className="btn on-dark lg"
              onClick={onOpenScope}
              disabled={scanning}
            >
              <ExternalLink size={17} />
              Open SCOPE
            </button>
          </div>

          {scanning ? (
            <div className="scan-progress" role="status">
              <div className="progress-track">
                <span />
              </div>
              <p>{progress || 'Starting...'}</p>
            </div>
          ) : (
            progress && (
              <p className="hero-note" role="status">
                {progress}
              </p>
            )
          )}

          <div className="hero-foot">
            <span className="hero-label">AI provider</span>
            <ProviderPicker
              settings={settings}
              disabled={scanning}
              onChoose={onChooseProvider}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </section>

        {(problem || loginNeeded) && (
          <div className="home-alerts">
            {problem && (
              <div className="alert">
                <TriangleAlert size={16} />
                <p>{problem}</p>
                <button type="button" className="btn sm" onClick={onOpenSettings}>
                  Open Settings
                </button>
              </div>
            )}
            {loginNeeded && (
              <div className="alert">
                <TriangleAlert size={16} />
                <p>
                  SCOPE needs you to log in. Open SCOPE and sign in with your CWL, then close that
                  window.
                </p>
                <button type="button" className="btn sm" onClick={onOpenScope}>
                  Open SCOPE
                </button>
              </div>
            )}
          </div>
        )}

        <div className="section-head">
          <h2>Latest scan</h2>
          {lastRun && (
            <button type="button" className="link-btn" onClick={onSeeRuns}>
              See all runs
              <ArrowRight size={14} />
            </button>
          )}
        </div>
        {lastRun ? (
          <RunCard run={lastRun} onOpenPosting={onOpenPosting} />
        ) : (
          <div className="card empty-state">
            <Radar size={30} />
            <h3>No scans yet</h3>
            <p>
              Log in with Open SCOPE, then press Scan now. Each scan&apos;s summary shows up here.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
