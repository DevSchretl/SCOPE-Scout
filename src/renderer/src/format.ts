// Display helpers for the UI.

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
