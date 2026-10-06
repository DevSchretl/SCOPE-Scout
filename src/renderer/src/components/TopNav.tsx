import {
  History,
  House,
  LoaderCircle,
  Radar,
  Settings,
  Table2,
  type LucideIcon
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ScopeStatus } from '../../../shared/types'
import { SCOPE_TEXT } from '../format'

/** The pages. Search has no link: you reach it from the search box. */
export type View = 'home' | 'postings' | 'runs' | 'search'

const LINKS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'postings', label: 'Postings', icon: Table2 },
  { id: 'runs', label: 'Past runs', icon: History }
]

interface Props {
  view: View
  onNavigate: (view: View) => void
  scanning: boolean
  progress: string
  scope: ScopeStatus
  onOpenScope: () => void
  onOpenSettings: () => void
  /** The search box, which sits in the middle of the bar. */
  search: ReactNode
}

export default function TopNav({
  view,
  onNavigate,
  scanning,
  progress,
  scope,
  onOpenScope,
  onOpenSettings,
  search
}: Props): React.JSX.Element {
  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-mark">
          <Radar size={17} strokeWidth={2.4} />
        </span>
        <span className="brand-name">
          SCOPE <span>Scout</span>
        </span>
      </div>

      <nav className="nav-links" aria-label="Main">
        {LINKS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            type="button"
            className={id === view ? 'nav-link active' : 'nav-link'}
            aria-current={id === view ? 'page' : undefined}
            title={`${label} (Ctrl+${i + 1})`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {search}

      {scanning && (
        <button
          type="button"
          className="scan-pill"
          title={progress || 'Scanning'}
          onClick={() => onNavigate('home')}
        >
          <LoaderCircle size={14} className="spin" />
          <span>{progress || 'Scanning...'}</span>
        </button>
      )}
      <button
        type="button"
        className="scope-status"
        data-status={scope}
        title={`${SCOPE_TEXT[scope]}. Click to open SCOPE.`}
        disabled={scanning}
        onClick={onOpenScope}
      >
        <span className="dot" />
        SCOPE
      </button>
      <button
        type="button"
        className="nav-icon"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        <Settings size={18} />
      </button>
    </header>
  )
}
