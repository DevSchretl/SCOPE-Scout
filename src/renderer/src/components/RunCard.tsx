import { useState } from 'react'
import {
  Bot,
  CircleCheck,
  CircleDollarSign,
  LogIn,
  OctagonAlert,
  Timer,
  TriangleAlert,
  type LucideIcon
} from 'lucide-react'
import {
  CLAUDE_MODELS,
  DUE_SOON_DAYS,
  DUE_SOON_MIN_MATCH,
  NEW_PICK_MIN_MATCH
} from '../../../shared/config'
import { parseDeadline } from '../../../shared/derive'
import type { RunRecord, RunStatus, SummaryItem } from '../../../shared/types'
import {
  formatCost,
  formatDeadline,
  formatDuration,
  formatRelative,
  formatRunDate
} from '../format'
import { MatchBadge } from './Badges'

interface Props {
  run: RunRecord
  onOpenPosting: (id: string) => void
}

const STATUS: Record<RunStatus, { text: string; icon: LucideIcon }> = {
  done: { text: 'Finished', icon: CircleCheck },
  'login-needed': { text: 'SCOPE login needed', icon: LogIn },
  error: { text: 'Stopped with an error', icon: OctagonAlert }
}

/** Lists start with this many rows, with a button for the rest. */
const SHORT_LIST = 5

function Stat({
  label,
  value,
  hint
}: {
  label: string
  value: number
  hint?: string
}): React.JSX.Element {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

function Items({
  title,
  items,
  onOpen
}: {
  title: string
  items: SummaryItem[]
  onOpen: (id: string) => void
}): React.JSX.Element {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHORT_LIST)
  return (
    <div className="run-list">
      <h4>{title}</h4>
      <ul>
        {shown.map((x) => (
          <li key={x.id}>
            <button type="button" className="run-item" onClick={() => onOpen(x.id)}>
              <MatchBadge value={x.match} />
              <span className="run-item-text">
                <span className="run-item-title">{x.title}</span>
                <span className="run-item-org">{x.org}</span>
              </span>
              {x.deadlineText && (
                <span className="run-item-due">
                  closes {formatDeadline(parseDeadline(x.deadlineText), x.deadlineText)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {items.length > SHORT_LIST && (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

export default function RunCard({ run, onOpenPosting }: Props): React.JSX.Element {
  const s = run.summary
  const status = STATUS[run.status]
  const StatusIcon = status.icon
  const byTerm = Object.entries(s.listedByTerm)
    .map(([term, n]) => `${term} ${n}`)
    .join(', ')
  const model = CLAUDE_MODELS.find((m) => m.id === run.model)?.label ?? run.model
  // A run that listed nothing (usually a login problem) only needs its note.
  const compact = run.status !== 'done' && s.listed === 0

  return (
    <article className={`run-card ${run.status}${compact ? ' compact' : ''}`}>
      <header className="run-head">
        <div>
          <h3>{formatRunDate(run.finishedAt)}</h3>
          <div className="run-meta">
            <span>{formatRelative(run.finishedAt)}</span>
            <span>
              <Timer size={13} />
              {formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt))}
            </span>
            {model && (
              <span>
                <Bot size={13} />
                {model}
              </span>
            )}
            <span>
              <CircleDollarSign size={13} />
              {formatCost(run.usage.costUsd)}
            </span>
          </div>
        </div>
        <span className={`status-pill ${run.status}`}>
          <StatusIcon size={14} />
          {status.text}
        </span>
      </header>

      {!compact && (
        <>
          <div className="run-stats">
            <Stat label="Listed" value={s.listed} hint={byTerm} />
            <Stat label="New" value={s.newListed} />
            <Stat label="Triaged" value={s.triaged} />
            <Stat label="Read" value={s.read} />
            <Stat label="Scored" value={s.scored} />
          </div>
          {s.newPicks.length > 0 ? (
            <Items
              title={`New picks rated ${NEW_PICK_MIN_MATCH}/10 or higher`}
              items={s.newPicks}
              onOpen={onOpenPosting}
            />
          ) : (
            <p className="run-none">No new picks rated {NEW_PICK_MIN_MATCH}/10 or higher.</p>
          )}
          {s.dueSoon.length > 0 && (
            <Items
              title={`Picks rated ${DUE_SOON_MIN_MATCH}+ closing within ${DUE_SOON_DAYS} days`}
              items={s.dueSoon}
              onOpen={onOpenPosting}
            />
          )}
        </>
      )}

      {s.notes.length > 0 && (
        <ul className="run-notes">
          {s.notes.map((n, i) => (
            <li key={i}>
              <TriangleAlert size={14} />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
