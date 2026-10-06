import {
  competitionLabel,
  daysLeft,
  isNewIn,
  postingMatch,
  reqMatchText
} from '../../../shared/derive'
import { MY_STATUSES, type MyStatus, type Posting, type RunRecord } from '../../../shared/types'
import { formatDate, formatDays, formatDeadline, matchColor } from '../format'

export type TableKind = 'picks' | 'near' | 'inprog' | 'all'

interface Props {
  rows: Posting[]
  kind: TableKind
  lastRun: RunRecord | null
  selectedId: string | null
  onSelect: (id: string) => void
  onStatus: (id: string, status: MyStatus) => void
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
      className="status-select"
      value={posting.myStatus}
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

export function MatchBadge({ value }: { value: number | null }): React.JSX.Element {
  if (value === null) return <span className="match none">n/a</span>
  return (
    <span className="match" style={{ background: matchColor(value) }}>
      {value.toFixed(1)}
    </span>
  )
}

const HEADERS: Record<TableKind, string[]> = {
  picks: [
    'Match',
    'Fit',
    'Req match',
    'Title',
    'Organization',
    'City',
    'Deadline',
    'Days left',
    'Applicants',
    'Status'
  ],
  near: ['Fit', 'Title', 'Organization', 'City', 'Why it missed', 'Added'],
  inprog: ['Title', 'Organization', 'Deadline', 'SCOPE app status', 'Your status'],
  all: [
    'ID',
    'Title',
    'Organization',
    'Location',
    'Deadline',
    'Term',
    'Read',
    'First seen',
    'On SCOPE'
  ]
}

export default function PostingTable({
  rows,
  kind,
  lastRun,
  selectedId,
  onSelect,
  onStatus
}: Props): React.JSX.Element {
  if (!rows.length) return <p className="empty">Nothing here yet.</p>
  return (
    <table className={`postings ${kind}`}>
      <thead>
        <tr>
          {HEADERS[kind].map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const days = daysLeft(p.listing.deadline)
          const classes = [
            p.id === selectedId ? 'selected' : '',
            days !== null && days < 0 ? 'past' : '',
            days !== null && days >= 0 && days <= 3 ? 'due-soon' : '',
            p.myStatus === 'Skip' || !p.onScopeNow ? 'dim' : ''
          ]
          const title = (
            <td className="title">
              {isNewIn(p, lastRun) && <span className="new">New</span>}
              {p.listing.title}
            </td>
          )
          const deadline = (
            <td className="nowrap">{formatDeadline(p.listing.deadline, p.listing.deadlineText)}</td>
          )
          return (
            <tr key={p.id} className={classes.join(' ')} onClick={() => onSelect(p.id)}>
              {kind === 'picks' && (
                <>
                  <td>
                    <MatchBadge value={postingMatch(p)} />
                  </td>
                  <td className="num">{p.score?.fit ?? ''}</td>
                  <td className="nowrap">{reqMatchText(p.score) || 'not counted'}</td>
                  {title}
                  <td>{p.listing.org}</td>
                  <td>{p.score?.city || p.listing.location}</td>
                  {deadline}
                  <td className="num">{formatDays(days)}</td>
                  <td className="num" title={competitionLabel(p.listing.applicants)}>
                    {p.listing.applicants ?? ''}
                  </td>
                  <td>
                    <StatusSelect posting={p} onStatus={onStatus} />
                  </td>
                </>
              )}
              {kind === 'near' && (
                <>
                  <td className="num">{p.score?.fit ?? ''}</td>
                  {title}
                  <td>{p.listing.org}</td>
                  <td>{p.score?.city || p.listing.location}</td>
                  <td className="wrap">{p.score?.whyMissed}</td>
                  <td className="nowrap">{formatDate(p.score?.scoredAt)}</td>
                </>
              )}
              {kind === 'inprog' && (
                <>
                  {title}
                  <td>{p.listing.org}</td>
                  {deadline}
                  <td>{p.listing.appStatus !== '-' ? p.listing.appStatus : ''}</td>
                  <td>
                    <StatusSelect posting={p} onStatus={onStatus} />
                  </td>
                </>
              )}
              {kind === 'all' && (
                <>
                  <td className="num">{p.id}</td>
                  {title}
                  <td>{p.listing.org}</td>
                  <td>{p.listing.location}</td>
                  {deadline}
                  <td>{p.term}</td>
                  <td>{p.details || p.score ? 'Yes' : 'No'}</td>
                  <td className="nowrap">{formatDate(p.firstSeen)}</td>
                  <td>{p.onScopeNow ? 'Yes' : 'No'}</td>
                </>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
