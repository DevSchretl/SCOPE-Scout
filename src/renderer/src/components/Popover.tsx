import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

/** How the popover was opened or closed: its button, a click elsewhere, or Esc. */
export type PopoverReason = 'button' | 'outside' | 'escape'

interface Props {
  open: boolean
  onOpenChange: (open: boolean, reason: PopoverReason) => void
  /** What the button shows. */
  label: ReactNode
  buttonClass?: string
  title?: string
  disabled?: boolean
  panelClass?: string
  align?: 'start' | 'end'
  className?: string
  /** A menu of choices, or a dialog with its own controls. */
  role?: 'menu' | 'dialog'
  children: ReactNode
}

/**
 * A button with a panel under it. The panel closes on an outside click or Esc. On opening it
 * focuses the element marked data-autofocus, else the checked item, else the first item.
 * Arrow keys move between .menu-item buttons.
 */
export default function Popover({
  open,
  onOpenChange,
  label,
  buttonClass = 'btn',
  title,
  disabled,
  panelClass = '',
  align = 'start',
  className = '',
  role = 'menu',
  children
}: Props): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // The listeners below live as long as the panel is open, so they read the latest callback.
  const change = useRef(onOpenChange)
  useEffect(() => {
    change.current = onOpenChange
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) change.current(false, 'outside')
    }
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      change.current(false, 'escape')
      button.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    // Capture, so Esc closes the innermost thing first (not the drawer underneath).
    document.addEventListener('keydown', onKey, true)
    const find = (selector: string): HTMLElement | null | undefined =>
      panel.current?.querySelector<HTMLElement>(selector)
    const first =
      find('[data-autofocus]') ??
      find('.menu-item[aria-checked="true"]') ??
      find('.menu-item:not(:disabled)')
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const target = e.target as HTMLElement
    const fromSearch = target.matches('[data-menu-search]')
    if (!target.matches('.menu-item') && !(fromSearch && e.key === 'ArrowDown')) return
    const items = [
      ...(panel.current?.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') ?? [])
    ]
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(target)
    const next =
      e.key === 'Home' || fromSearch
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : e.key === 'ArrowDown'
            ? Math.min(i + 1, items.length - 1)
            : Math.max(i - 1, 0)
    items[next].focus()
  }

  return (
    <div className={`popover-anchor ${className}`} ref={wrap}>
      <button
        ref={button}
        type="button"
        className={buttonClass}
        title={title}
        disabled={disabled}
        aria-haspopup={role}
        aria-expanded={open}
        onClick={() => onOpenChange(!open, 'button')}
      >
        {label}
      </button>
      {open && (
        <div
          ref={panel}
          role={role}
          className={`popover ${align} ${panelClass}`}
          onKeyDown={onPanelKey}
        >
          {children}
        </div>
      )}
    </div>
  )
}
