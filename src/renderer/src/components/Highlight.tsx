import { useMemo } from 'react'
import { markRanges, type Mark } from '../../../shared/search'

/** Text with the searched words marked. */
export default function Highlight({
  text,
  marks
}: {
  text: string
  marks?: Mark[]
}): React.JSX.Element {
  const ranges = useMemo(() => (marks?.length ? markRanges(text, marks) : []), [text, marks])
  if (!ranges.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let at = 0
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>)
    at = end
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}
