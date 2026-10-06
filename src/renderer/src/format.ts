// Display helpers for the UI.

import type { ScopeStatus } from '../../shared/types'

export const SCOPE_TEXT: Record<ScopeStatus, string> = {
  unknown: 'SCOPE not checked',
  checking: 'Checking SCOPE...',
  'logged-in': 'Logged in to SCOPE',
  'login-needed': 'SCOPE login needed',
  error: 'SCOPE unreachable'
}

/** Excel's 3-colour scale from the old workbook: 1 red, 6 yellow, 10 green. */
export function matchColor(m: number): string {
  const red = [0xf8, 0x69, 0x6b]
  const yellow = [0xff, 0xeb, 0x84]
  const green = [0x63, 0xbe, 0x7b]
  const [from, to, t] = m <= 6 ? [red, yellow, (m - 1) / 5] : [yellow, green, (m - 6) / 4]
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t))
  return `rgb(${mix.join(', ')})`
}

/** "Oct 9, 9:00 AM" from a SCOPE wall-clock deadline. */
export function formatDeadline(deadline: string | null, fallback = ''): string {
  if (!deadline) return fallback
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return fallback
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatDays(days: number | null): string {
  if (days === null) return ''
  return days < 0 ? 'closed' : days.toFixed(1)
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
}

/** "Mon, Oct 5 at 9:12 PM". */
export function formatRunDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} at ${time}`
}

/** "5 min ago", "yesterday", "4 days ago". */
export function formatRelative(iso: string, now = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const minutes = Math.round((now.getTime() - t) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** "45 s", "2 min 52 s", "1 h 3 min". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function formatCost(usd: number): string {
  if (usd <= 0) return 'Free'
  return usd < 0.01 ? 'Under $0.01' : `$${usd.toFixed(2)}`
}
