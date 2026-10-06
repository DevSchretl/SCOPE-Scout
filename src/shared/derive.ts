// Pure functions shared by the main process and the UI. The maths and parsing mirror
// update_workbook.py from the old scheduled task so scores stay comparable.

import type { Posting, RunRecord, Score } from './types'

/** Applicant-count penalty (comp_penalty in update_workbook.py). */
export function competitionPenalty(applicants: number | null | undefined): number {
  if (typeof applicants !== 'number' || Number.isNaN(applicants)) return 0
  return applicants >= 60 ? 1.5 : applicants >= 30 ? 1.0 : applicants >= 10 ? 0.5 : 0
}

export function competitionLabel(applicants: number | null | undefined): string {
  if (typeof applicants !== 'number' || Number.isNaN(applicants)) return ''
  return applicants >= 60
    ? 'Very high'
    : applicants >= 30
      ? 'High'
      : applicants >= 10
        ? 'Medium'
        : 'Low'
}

/**
 * Match /10 (match10 in update_workbook.py): 10 x (0.45 x required share squared
 * + 0.15 x preferred share + 0.40 x (fit - 1) / 4), minus the competition penalty and
 * 0.5 for a thin description, rounded to the nearest 0.5 and kept within 1 to 10.
 * Null when the requirements were never counted.
 */
export function matchScore(
  score: Score | undefined,
  applicants: number | null | undefined
): number | null {
  if (!score) return null
  const rt = score.requiredTotal
  const rm = score.requiredMet
  if (rt == null || rm == null) return null
  const pt = score.preferredTotal || 0
  const pm = score.preferredMet || 0
  const rr = rt ? (rm / rt) ** 2 : 0.49
  const pr = pt ? pm / pt : 0.5
  const f = score.fit || 1
  const v =
    10 * (0.45 * rr + 0.15 * pr + (0.4 * (f - 1)) / 4) -
    competitionPenalty(applicants) -
    (score.thinDescription ? 0.5 : 0)
  return Math.max(1, Math.min(10, Math.floor(v * 2 + 0.5) / 2))
}

/** "3/4 req, 1/2 pref", like the workbook's Req match column. */
export function reqMatchText(score: Score | undefined): string {
  if (!score || score.requiredTotal == null || score.requiredMet == null) return ''
  let text = `${score.requiredMet}/${score.requiredTotal} req`
  if (score.preferredTotal) text += `, ${score.preferredMet ?? 0}/${score.preferredTotal} pref`
  return text
}

/** Strips the term prefix and SCOPE's trailing posting number ("W27 Intern, Developer 185295B"). */
export function cleanTitle(title: string): string {
  return title
    .replace(/^NEW\s+/, '')
    .replace(/^[WSF]\d{2}\s+/i, '')
    .replace(/\s+\d{6,7}B?(\s+E\d)?$/, '')
    .trim()
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Oct 9, 2026 09:00 AM" becomes "2026-10-09T09:00" (Pacific wall clock), or null. */
export function parseDeadline(text: string): string | null {
  const m =
    /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(
      text.trim()
    )
  if (!m) return null
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1
  if (!month) return null
  let hour = Number(m[4]) % 12
  if (m[6].toUpperCase() === 'PM') hour += 12
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${m[3]}-${pad(month)}-${pad(Number(m[2]))}T${pad(hour)}:${m[5]}`
}

/** Fractional days until the deadline (negative once it has passed), like the workbook's Days left. */
export function daysLeft(deadline: string | null, now: Date = new Date()): number | null {
  if (!deadline) return null
  const t = new Date(deadline).getTime()
  if (Number.isNaN(t)) return null
  return (t - now.getTime()) / 86_400_000
}

export function parseApplicants(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
}

export type Section = 'inprog' | 'pick' | 'near' | 'none' | 'unread'

/** Which tab a posting belongs to. Your own status and SCOPE's app status win over the AI. */
export function sectionOf(p: Posting): Section {
  const applied = p.listing.appStatus && p.listing.appStatus !== '-'
  if (applied || p.myStatus === 'Drafting' || p.myStatus === 'Applied') return 'inprog'
  if (!p.score) return 'unread'
  return p.score.section
}

export function postingMatch(p: Posting): number | null {
  return matchScore(p.score, p.listing.applicants)
}

/**
 * Picks sort like the workbook (best match first, then the earliest deadline), except that
 * closed postings and ones you marked Skip go to the bottom.
 */
export function comparePicks(a: Posting, b: Posting, now: Date = new Date()): number {
  const ma = sortableMatch(a, now)
  const mb = sortableMatch(b, now)
  if (ma !== mb) return mb - ma
  return (a.listing.deadline ?? '9999').localeCompare(b.listing.deadline ?? '9999')
}

function sortableMatch(p: Posting, now: Date): number {
  if (p.myStatus === 'Skip') return -200
  if ((daysLeft(p.listing.deadline, now) ?? 0) < 0) return -100 + (postingMatch(p) ?? 0)
  const m = postingMatch(p)
  // Same stand-in as update_workbook.py for rows whose requirements were never counted.
  return m ?? 2 * (p.score?.fit || 1) - 1.5
}

/** True when the posting was first listed or scored during the given run. */
export function isNewIn(p: Posting, run: RunRecord | null): boolean {
  if (!run) return false
  const since = Date.parse(run.startedAt)
  if (Date.parse(p.firstSeen) >= since) return true
  return !!p.score?.scoredAt && Date.parse(p.score.scoredAt) >= since
}
