import { useState } from 'react'
import {
  Check,
  ChevronDown,
  Layers,
  Leaf,
  ListFilter,
  PenLine,
  Snowflake,
  Star,
  Sun,
  Target,
  type LucideIcon
} from 'lucide-react'
import { SHEETS, type Sheet } from '../../../shared/sheets'
import Popover from './Popover'

const KIND_ICONS: Record<string, LucideIcon> = { near: Target, inprog: PenLine, all: Layers }
const TERM_ICONS: Record<string, LucideIcon> = { W: Snowflake, S: Sun, F: Leaf }

/** Snowflake for a winter term, sun for summer, leaf for fall. */
export function SheetIcon({ sheet }: { sheet: Sheet }): React.JSX.Element {
  const Icon = sheet.term
    ? (TERM_ICONS[sheet.term[0].toUpperCase()] ?? Star)
    : (KIND_ICONS[sheet.kind] ?? Layers)
  return (
    <span className={`sheet-icon ${sheet.kind}`}>
      <Icon size={16} strokeWidth={2.2} />
    </span>
  )
}

interface Props {
  sheet: Sheet
  counts: Record<string, number>
  /** Sheets that have filters on. */
  filtered: Set<string>
  onChoose: (id: string) => void
}

const GROUPS: [string, (s: Sheet) => boolean][] = [
  ['Picks', (s) => s.kind === 'picks'],
  ['Tracking', (s) => s.kind !== 'picks']
]

export default function SheetPicker({
  sheet,
  counts,
  filtered,
  onChoose
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={(o) => setOpen(o)}
      buttonClass="sheet-button"
      panelClass="sheet-menu"
      title="Choose a sheet"
      label={
        <>
          <SheetIcon sheet={sheet} />
          <span className="sheet-name">{sheet.label}</span>
          <span className="count-pill">{counts[sheet.id] ?? 0}</span>
          <ChevronDown size={18} className="chevron" />
        </>
      }
    >
      {GROUPS.map(([group, test]) => (
        <div key={group} className="menu-group">
          <div className="menu-label">{group}</div>
          {SHEETS.filter(test).map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitemradio"
              aria-checked={s.id === sheet.id}
              className="menu-item sheet-item"
              onClick={() => {
                onChoose(s.id)
                setOpen(false)
              }}
            >
              <SheetIcon sheet={s} />
              <span className="sheet-item-text">
                <span className="sheet-item-name">
                  {s.label}
                  {filtered.has(s.id) && (
                    <ListFilter size={13} className="filtered-mark" aria-label="Filtered" />
                  )}
                </span>
                <span className="sheet-item-desc">{s.description}</span>
              </span>
              <span className="count-pill">{counts[s.id] ?? 0}</span>
              <Check size={16} className="check" />
            </button>
          ))}
        </div>
      ))}
    </Popover>
  )
}
