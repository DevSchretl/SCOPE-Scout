import type { CSSProperties } from 'react'
import { DUE_SOON_DAYS } from '../../../shared/config'
import { daysLeft } from '../../../shared/derive'
import { MY_STATUSES, type MyStatus, type Posting } from '../../../shared/types'
import { formatDate, formatDays, matchColor } from '../format'

export function MatchBadge({
  value,
  large
}: {
  value: number | null
  large?: boolean
}): React.JSX.Element {
  const size = large ? ' large' : ''
  if (value === null)
    return (
      <span className={`match none${size}`} title="No match score">
        n/a
      </span>
    )
  return (
    <span
      className={`match${size}`}
      style={{ '--match': matchColor(value) } as CSSProperties}
      title={`Match ${value.toFixed(1)}/10`}
    >
      {value.toFixed(1)}
    </span>
  )
}

const STATUS_CLASS: Record<MyStatus, string> = {
  '': 'none',
  'To apply': 'apply',
  Drafting: 'drafting',
  Applied: 'applied',
  Skip: 'skip'
}

export function StatusSelect({
  posting,
  onStatus
}: {
  posting: Posting
  onStatus: (id: string, status: MyStatus) => void
}): React.JSX.Element {
  return (
    <select
      className={`status-select ${STATUS_CLASS[posting.myStatus]}`}
      value={posting.myStatus}
      aria-label="Your status"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onStatus(posting.id, e.target.value as MyStatus)}
    >
      {MY_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s || 'None'}
        </option>
      ))}
    </select>
  )
}

export function NewBadge(): React.JSX.Element {
  return <span className="new-badge">New</span>
}

/** Days left, as an amber pill when the deadline is close. */
export function DaysLeft({ days }: { days: number | null }): React.JSX.Element | null {
  if (days === null) return null
  if (days < 0) return <span className="days closed">closed</span>
  return <span className={days <= DUE_SOON_DAYS ? 'days soon' : 'days'}>{formatDays(days)}</span>
}

/** Your status as a small colored tag, or nothing when it isn't set. */
export function StatusTag({ status }: { status: MyStatus }): React.JSX.Element | null {
  if (!status) return null
  return <span className={`tag status ${STATUS_CLASS[status]}`}>{status}</span>
}

/** "closes Oct 12" (amber when close), or "closed". */
export function Closes({ deadline }: { deadline: string | null }): React.JSX.Element | null {
  const days = daysLeft(deadline)
  if (deadline === null || days === null) return null
  if (days < 0) return <span className="closes closed">closed</span>
  return (
    <span className={days <= DUE_SOON_DAYS ? 'closes soon' : 'closes'}>
      closes {formatDate(deadline)}
    </span>
  )
}
