import { DUE_SOON_DAYS } from '../../../shared/config'
import {
  competitionLabel,
  daysLeft,
  isNewIn,
  postingMatch,
  reqMatchText
} from '../../../shared/derive'
import type { SheetKind } from '../../../shared/sheets'
import type { MyStatus, Posting, RunRecord } from '../../../shared/types'
import { formatDate, formatDeadline } from '../format'
import { DaysLeft, MatchBadge, NewBadge, StatusSelect } from './Badges'

interface Props {
  rows: Posting[]
  kind: SheetKind
  lastRun: RunRecord | null
  selectedId: string | null
  onSelect: (id: string) => void
  onStatus: (id: string, status: MyStatus) => void
}

/** Column headers; a leading "#" right-aligns the column. */
const HEADERS: Record<SheetKind, string[]> = {
  picks: [
    'Match',
    '#Fit',
    'Req match',
    'Title',
    'Organization',
    'City',
    'Deadline',
    '#Days left',
    '#Applicants',
    'Status'
  ],
  near: ['#Fit', 'Title', 'Organization', 'City', 'Why it missed', 'Added'],
  inprog: ['Title', 'Organization', 'Deadline', 'SCOPE app status', 'Your status'],
  all: [
    '#ID',
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
  return (
    <table className={`postings ${kind}`}>
      <thead>
        <tr>
          {HEADERS[kind].map((h) => (
            <th key={h} className={h.startsWith('#') ? 'num' : undefined}>
              {h.replace(/^#/, '')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const days = daysLeft(p.listing.deadline)
          const closed = days !== null && days < 0
          const soon = days !== null && days >= 0 && days <= DUE_SOON_DAYS
          const classes = [
            p.id === selectedId ? 'selected' : '',
            closed || p.myStatus === 'Skip' || !p.onScopeNow ? 'muted' : ''
          ]
          const title = (
            <td className="title">
              {isNewIn(p, lastRun) && <NewBadge />}
              {p.listing.title}
            </td>
          )
          const org = <td className="org">{p.listing.org}</td>
          const deadline = (
            <td className={soon ? 'nowrap soon-text' : 'nowrap'}>
              {formatDeadline(p.listing.deadline, p.listing.deadlineText)}
            </td>
          )
          return (
            <tr
              key={p.id}
              className={classes.join(' ').trim()}
              aria-selected={p.id === selectedId}
              onClick={() => onSelect(p.id)}
            >
              {kind === 'picks' && (
                <>
                  <td>
                    <MatchBadge value={postingMatch(p)} />
                  </td>
                  <td className="num">{p.score?.fit ?? ''}</td>
                  <td className="nowrap">
                    {reqMatchText(p.score) || <span className="faint">not counted</span>}
                  </td>
                  {title}
                  {org}
                  <td>{p.score?.city || p.listing.location}</td>
                  {deadline}
                  <td className="num">
                    <DaysLeft days={days} />
                  </td>
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
                  {org}
                  <td>{p.score?.city || p.listing.location}</td>
                  <td className="wrap">{p.score?.whyMissed}</td>
                  <td className="nowrap">{formatDate(p.score?.scoredAt)}</td>
                </>
              )}
              {kind === 'inprog' && (
                <>
                  {title}
                  {org}
                  {deadline}
                  <td>{p.listing.appStatus !== '-' ? p.listing.appStatus : ''}</td>
                  <td>
                    <StatusSelect posting={p} onStatus={onStatus} />
                  </td>
                </>
              )}
              {kind === 'all' && (
                <>
                  <td className="num faint">{p.id}</td>
                  {title}
                  {org}
                  <td>{p.listing.location}</td>
                  {deadline}
                  <td>{p.term}</td>
                  <td>{p.details || p.score ? 'Yes' : <span className="faint">No</span>}</td>
                  <td className="nowrap">{formatDate(p.firstSeen)}</td>
                  <td>{p.onScopeNow ? 'Yes' : <span className="faint">No</span>}</td>
                </>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
