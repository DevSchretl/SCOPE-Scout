import { History } from 'lucide-react'
import type { RunRecord } from '../../../shared/types'
import RunCard from '../components/RunCard'
import { formatCost } from '../format'

interface Props {
  runs: RunRecord[]
  onOpenPosting: (id: string) => void
}

export default function RunsPage({ runs, onOpenPosting }: Props): React.JSX.Element {
  const spent = runs.reduce((sum, r) => sum + r.usage.costUsd, 0)
  const scored = runs.reduce((sum, r) => sum + r.summary.scored, 0)
  const newest = [...runs].reverse()

  return (
    <main className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1>Past runs</h1>
          <p>
            {runs.length} {runs.length === 1 ? 'scan' : 'scans'} ·{' '}
            {spent > 0 ? `${formatCost(spent)} spent on AI` : 'nothing spent on AI'} · {scored}{' '}
            {scored === 1 ? 'posting' : 'postings'} scored
          </p>
        </header>
        {newest.length ? (
          <div className="run-feed">
            {newest.map((r) => (
              <RunCard key={r.startedAt} run={r} onOpenPosting={onOpenPosting} />
            ))}
          </div>
        ) : (
          <div className="card empty-state">
            <History size={30} />
            <h3>No scans yet</h3>
            <p>Every scan you run is summarized here, newest first.</p>
          </div>
        )}
      </div>
    </main>
  )
}
