import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '../auth/icons'

type Props = {
  /** Id of the visible label, which names the trigger. */
  labelId: string
  /** Names the popup, e.g. "Countries". */
  listLabel: string
  options: string[]
  value: string | null
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}

/** A one-choice dropdown: Arrow keys move, Enter picks, Esc closes and returns focus to the trigger. */
export function StarterSelect({
  labelId,
  listLabel,
  options,
  value,
  placeholder,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    const start = Math.max(0, options.indexOf(value ?? ''))
    items.current[start]?.focus()
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open, options, value])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = items.current.findIndex((el) => el === document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      items.current[(at + step + options.length) % options.length]?.focus()
    }
  }

  return (
    <div className="dropdown block" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        className="btn btn-secondary menu-trigger"
        type="button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((now) => !now)}
      >
        <span>{value ?? placeholder}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="menu menu-pop" role="listbox" aria-label={listLabel}>
          {options.map((option, i) => (
            <button
              key={option}
              ref={(el) => {
                items.current[i] = el
              }}
              className="menu-item"
              type="button"
              role="option"
              aria-selected={option === value}
              aria-checked={option === value}
              onClick={() => {
                onChange(option)
                close()
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
