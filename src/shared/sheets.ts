// The sheets of the Postings page, like the tabs of the old workbook. Each quick search
// gets its own picks sheet, so a new co-op cycle only needs QUICK_SEARCHES changed.

import { QUICK_SEARCHES } from './config'
import { comparePicks, sectionOf } from './derive'
import type { Posting } from './types'

/** Which columns the table shows. */
export type SheetKind = 'picks' | 'near' | 'inprog' | 'all'

export interface Sheet {
  id: string
  label: string
  description: string
  kind: SheetKind
  /** Term of a picks sheet, e.g. "W27". */
  term?: string
  test: (p: Posting) => boolean
  sort: (a: Posting, b: Posting) => number
}

const termOrder = (p: Posting): number => {
  const i = QUICK_SEARCHES.findIndex((q) => q.term === p.term)
  return i < 0 ? 99 : i
}
const byDeadline = (a: Posting, b: Posting): number =>
  (a.listing.deadline ?? '9999').localeCompare(b.listing.deadline ?? '9999')

export const SHEETS: Sheet[] = [
  ...QUICK_SEARCHES.map((qs): Sheet => ({
    id: `pick-${qs.term}`,
    label: qs.label,
    description: qs.strict
      ? `${qs.term} postings the AI picked, with a stricter bar`
      : `${qs.term} postings the AI picked for you`,
    kind: 'picks',
    term: qs.term,
    test: (p) => sectionOf(p) === 'pick' && p.term === qs.term,
    sort: comparePicks
  })),
  {
    id: 'near',
    label: 'Near misses',
    description: 'Read and scored, but missed the bar',
    kind: 'near',
    test: (p) => sectionOf(p) === 'near',
    sort: (a, b) => (b.score?.scoredAt ?? '').localeCompare(a.score?.scoredAt ?? '')
  },
  {
    id: 'inprog',
    label: 'In progress',
    description: 'Drafting, applied, or applied on SCOPE',
    kind: 'inprog',
    test: (p) => sectionOf(p) === 'inprog',
    sort: (a, b) => a.listing.org.localeCompare(b.listing.org) || byDeadline(a, b)
  },
  {
    id: 'all',
    label: 'All postings',
    description: 'Everything the scans have listed',
    kind: 'all',
    test: () => true,
    sort: (a, b) => termOrder(a) - termOrder(b) || byDeadline(a, b)
  }
]

export function sheetById(id: string): Sheet {
  return SHEETS.find((s) => s.id === id) ?? SHEETS[0]
}
