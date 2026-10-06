import {
  DUE_SOON_DAYS,
  DUE_SOON_MIN_MATCH,
  MODELS,
  NEW_PICK_MIN_MATCH
} from '../../../shared/config'
import type { RunRecord, SummaryItem } from '../../../shared/types'
import { formatDateTime } from '../format'

interface Props {
  run: RunRecord
  onSelect: (id: string) => void
  onClose: () => void
}

const STATUS: Record<RunRecord['status'], string> = {
  done: 'finished',
  'login-needed': 'SCOPE login needed',
  error: 'stopped with an error'
}

function Items({
  items,
  onSelect
}: {
  items: SummaryItem[]
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <ul>
      {items.map((x) => (
        <li key={x.id}>
          <button className="link" onClick={() => onSelect(x.id)}>
            {x.title}
          </button>{' '}
          ({x.org}){x.match !== null && `, ${x.match.toFixed(1)}/10`}
          {x.deadlineText && `, closes ${x.deadlineText}`}
        </li>
      ))}
    </ul>
  )
}

export default function RunSummary({ run, onSelect, onClose }: Props): React.JSX.Element {
  const s = run.summary
  const byTerm = Object.entries(s.listedByTerm)
    .map(([term, n]) => `${term} ${n}`)
    .join(', ')
  const model = MODELS.find((m) => m.id === run.model)?.label ?? run.model
  return (
    <section className={`summary ${run.status}`}>
      <header>
        <strong>Last scan {STATUS[run.status]}</strong>
        <span className="muted">
          {formatDateTime(run.finishedAt)} · {model} · about ${run.usage.costUsd.toFixed(2)}
        </span>
        <button className="icon" onClick={onClose} aria-label="Hide summary">
          ×
        </button>
      </header>
      <p>
        {s.listed} listed{byTerm && ` (${byTerm})`}, {s.newListed} new, {s.triaged} triaged,{' '}
        {s.read} read in full, {s.scored} scored.
      </p>
      {s.newPicks.length > 0 ? (
        <>
          <h4>New picks rated {NEW_PICK_MIN_MATCH}/10 or higher</h4>
          <Items items={s.newPicks} onSelect={onSelect} />
        </>
      ) : (
        <p className="muted">No new picks rated {NEW_PICK_MIN_MATCH}/10 or higher.</p>
      )}
      {s.dueSoon.length > 0 && (
        <>
          <h4>
            Picks rated {DUE_SOON_MIN_MATCH}/10 or higher closing in the next {DUE_SOON_DAYS} days
          </h4>
          <Items items={s.dueSoon} onSelect={onSelect} />
        </>
      )}
      {s.notes.length > 0 && (
        <>
          <h4>Notes</h4>
          <ul>
            {s.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
