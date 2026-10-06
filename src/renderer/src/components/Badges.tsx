import type { CSSProperties } from 'react'
import { DUE_SOON_DAYS } from '../../../shared/config'
import { MY_STATUSES, type MyStatus, type Posting } from '../../../shared/types'
import { formatDays, matchColor } from '../format'

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
