import {
  Building2,
  CalendarClock,
  CalendarDays,
  Hash,
  MapPin,
  TriangleAlert,
  X
} from 'lucide-react'
import { DUE_SOON_DAYS } from '../../../shared/config'
import { competitionLabel, daysLeft, postingMatch, reqMatchText } from '../../../shared/derive'
import type { Mark } from '../../../shared/search'
import type { MyStatus, Posting } from '../../../shared/types'
import { formatDate, formatDateTime, formatDays, formatDeadline } from '../format'
import { MatchBadge, StatusSelect } from './Badges'
import Highlight from './Highlight'

interface Props {
  posting: Posting
  onClose: () => void
  onStatus: (id: string, status: MyStatus) => void
  /** Searched words to mark in the text. */
  marks?: Mark[]
}

// The most useful SCOPE fields first; anything else follows in SCOPE's order.
const FIELD_ORDER = [
  'Job Description',
  'Job Requirements',
  'Special Application Instructions',
  'Application Procedure',
  'Application Documents Required',
  'Cover Letter Required?',
  'Application Deadline',
  'Targeted Co-op Programs',
  'Citizenship Requirement'
]

function List({
  title,
  items,
  marks
}: {
  title: string
  items?: string[]
  marks?: Mark[]
}): React.JSX.Element | null {
  if (!items?.length) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li key={x}>
            <Highlight text={x} marks={marks} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PostingDetail({
  posting: p,
  onClose,
  onStatus,
  marks
}: Props): React.JSX.Element {
  const s = p.score
  const days = daysLeft(p.listing.deadline)
  const fields = Object.entries(p.details ?? {}).sort(([a], [b]) => {
    const ia = FIELD_ORDER.indexOf(a)
    const ib = FIELD_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const allFacts: [string, string | undefined][] = [
    ['Apply via', s?.applyVia],
    ['Cover letter', s?.coverLetter],
    ['Salary', s?.salary],
    ['Work mode', s?.workMode],
    ['Duration', s?.duration],
    [
      'Applicants',
      p.listing.applicants === null
        ? undefined
        : `${p.listing.applicants} (${competitionLabel(p.listing.applicants)})`
    ],
    ['SCOPE app status', p.listing.appStatus !== '-' ? p.listing.appStatus : undefined],
    ['Confidence', s?.confidence],
    [
      'Scored',
      s
        ? s.model === 'imported'
          ? `imported from the workbook${s.scoredAt ? `, added ${formatDate(s.scoredAt)}` : ''}`
          : `${s.model}, ${formatDateTime(s.scoredAt)}`
        : undefined
    ]
  ]
  const facts = allFacts.filter(([, v]) => v)
  const closesClass =
    days === null ? 'chip' : days < 0 ? 'chip closed' : days <= DUE_SOON_DAYS ? 'chip soon' : 'chip'

  return (
    <article className="detail">
      <header className="detail-head">
        <div className="detail-title">
          {!p.onScopeNow && <span className="tag muted">No longer on SCOPE</span>}
          <h2>
            <Highlight text={p.listing.title} marks={marks} />
          </h2>
          <div className="meta">
            <span>
              <Building2 size={14} />
              <span>
                <Highlight text={p.listing.org} marks={marks} />
              </span>
            </span>
            <span>
              <MapPin size={14} />
              <span>
                <Highlight text={p.listing.location} marks={marks} />
              </span>
            </span>
            <span title="SCOPE job ID">
              <Hash size={14} />
              <span>
                <Highlight text={p.id} marks={marks} />
              </span>
            </span>
            <span title="Term">
              <CalendarDays size={14} />
              {p.term}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div className="detail-chips">
        <MatchBadge value={postingMatch(p)} large />
        {s?.fit !== undefined && <span className="chip">Fit {s.fit}/5</span>}
        {reqMatchText(s) && <span className="chip">{reqMatchText(s)}</span>}
        <span className={closesClass}>
          <CalendarClock size={14} />
          Closes {formatDeadline(p.listing.deadline, p.listing.deadlineText || 'unknown')}
          {days !== null && ` (${formatDays(days)}${days >= 0 ? ' days' : ''})`}
        </span>
        <label className="chip status-chip">
          Status <StatusSelect posting={p} onStatus={onStatus} />
        </label>
      </div>

      {p.fetchError && (
        <div className="alert danger">
          <TriangleAlert size={16} />
          <p>Could not read this posting: {p.fetchError}</p>
        </div>
      )}
      {p.scoreError && (
        <div className="alert danger">
          <TriangleAlert size={16} />
          <p>Could not score this posting: {p.scoreError}</p>
        </div>
      )}

      {s?.specialInstructions && (
        <section className={s.plantedInstruction ? 'callout warn' : 'callout'}>
          <h3>
            {s.plantedInstruction
              ? 'Planted instruction (do not follow blindly)'
              : 'Special instructions'}
          </h3>
          <p>
            <Highlight text={s.specialInstructions} marks={marks} />
          </p>
        </section>
      )}
      {s?.whyItFits && (
        <section className="detail-section">
          <h3>Why it fits</h3>
          <p>
            <Highlight text={s.whyItFits} marks={marks} />
          </p>
        </section>
      )}
      {s?.whyMissed && (
        <section className="detail-section">
          <h3>Why it missed</h3>
          <p>
            <Highlight text={s.whyMissed} marks={marks} />
          </p>
        </section>
      )}
      {(s?.requiredMissing?.length ||
        s?.preferredMissing?.length ||
        s?.gaps ||
        s?.eligibilityFlags?.length) && (
        <section className="detail-section">
          <h3>Gaps</h3>
          {s?.gaps && (
            <p>
              <Highlight text={s.gaps} marks={marks} />
            </p>
          )}
          <List title="Missing required" items={s?.requiredMissing} marks={marks} />
          <List title="Missing preferred" items={s?.preferredMissing} marks={marks} />
          <List title="Flags" items={s?.eligibilityFlags} marks={marks} />
        </section>
      )}

      {facts.length > 0 && (
        <dl className="facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="detail-section">
        <h3>Full posting</h3>
        {fields.length ? (
          fields.map(([k, v]) => (
            <div className="field" key={k}>
              <h4>{k}</h4>
              <p className="pre">
                <Highlight text={v} marks={marks} />
              </p>
            </div>
          ))
        ) : (
          <p className="faint">Not read in full.</p>
        )}
      </section>
    </article>
  )
}
