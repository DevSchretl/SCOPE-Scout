import { competitionLabel, daysLeft, postingMatch, reqMatchText } from '../../../shared/derive'
import type { MyStatus, Posting } from '../../../shared/types'
import { formatDate, formatDateTime, formatDays, formatDeadline } from '../format'
import { MatchBadge, StatusSelect } from './PostingTable'

interface Props {
  posting: Posting
  onClose: () => void
  onStatus: (id: string, status: MyStatus) => void
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

function List({ title, items }: { title: string; items?: string[] }): React.JSX.Element | null {
  if (!items?.length) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

export default function PostingDetail({ posting: p, onClose, onStatus }: Props): React.JSX.Element {
  const s = p.score
  const days = daysLeft(p.listing.deadline)
  const fields = Object.entries(p.details ?? {}).sort(([a], [b]) => {
    const ia = FIELD_ORDER.indexOf(a)
    const ib = FIELD_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const facts: [string, string | undefined][] = [
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

  return (
    <aside className="detail">
      <header>
        <div>
          <h2>{p.listing.title}</h2>
          <div className="sub">
            {p.listing.org} · {p.listing.location} · ID {p.id} · {p.term}
            {!p.onScopeNow && ' · no longer on SCOPE'}
          </div>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="chips">
        <MatchBadge value={postingMatch(p)} />
        {s?.fit !== undefined && <span className="chip">Fit {s.fit}/5</span>}
        {reqMatchText(s) && <span className="chip">{reqMatchText(s)}</span>}
        <span className="chip">
          Closes {formatDeadline(p.listing.deadline, p.listing.deadlineText || 'unknown')}
          {days !== null && ` (${formatDays(days)}${days >= 0 ? ' days' : ''})`}
        </span>
        <label className="chip">
          Status <StatusSelect posting={p} onStatus={onStatus} />
        </label>
      </div>

      {p.fetchError && <p className="error">Could not read this posting: {p.fetchError}</p>}
      {p.scoreError && <p className="error">Could not score this posting: {p.scoreError}</p>}

      {s?.specialInstructions && (
        <section className={s.plantedInstruction ? 'callout warn' : 'callout'}>
          <h3>
            {s.plantedInstruction
              ? 'Planted instruction (do not follow blindly)'
              : 'Special instructions'}
          </h3>
          <p>{s.specialInstructions}</p>
        </section>
      )}
      {s?.whyItFits && (
        <section>
          <h3>Why it fits</h3>
          <p>{s.whyItFits}</p>
        </section>
      )}
      {s?.whyMissed && (
        <section>
          <h3>Why it missed</h3>
          <p>{s.whyMissed}</p>
        </section>
      )}
      {(s?.requiredMissing?.length ||
        s?.preferredMissing?.length ||
        s?.gaps ||
        s?.eligibilityFlags?.length) && (
        <section>
          <h3>Gaps</h3>
          {s?.gaps && <p>{s.gaps}</p>}
          <List title="Missing required" items={s?.requiredMissing} />
          <List title="Missing preferred" items={s?.preferredMissing} />
          <List title="Flags" items={s?.eligibilityFlags} />
        </section>
      )}

      <dl className="facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>

      <section>
        <h3>Full posting</h3>
        {fields.length ? (
          fields.map(([k, v]) => (
            <div className="field" key={k}>
              <h4>{k}</h4>
              <p className="pre">{v}</p>
            </div>
          ))
        ) : (
          <p className="muted">Not read in full.</p>
        )}
      </section>
    </aside>
  )
}
