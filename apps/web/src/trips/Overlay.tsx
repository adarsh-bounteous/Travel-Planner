import { useEffect, useRef } from 'react'
import type { AnimationEvent, KeyboardEvent, ReactNode } from 'react'
import { useExit } from '../motion'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea'

type OverlayProps = {
  kind: 'drawer' | 'modal'
  role?: 'dialog' | 'alertdialog'
  labelledBy: string
  describedBy?: string
  /** True while another overlay sits on top of this one. */
  covered?: boolean
  onClose: () => void
  children: ReactNode
}

/** A drawer or modal with a backdrop: focus moves in, is trapped, Escape closes, focus returns to the trigger. */
export function Overlay({
  kind,
  role = 'dialog',
  labelledBy,
  describedBy,
  covered,
  onClose,
  children,
}: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null)
  const exit = useExit(onClose)
  const motion = exit.leaving ? 'is-leaving' : 'is-entering'
  const onEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) exit.onAnimationEnd()
  }

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()
    return () => trigger?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      exit.start()
      return
    }
    if (event.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const { activeElement } = document
    if (event.shiftKey && activeElement === items[0]) {
      event.preventDefault()
      items[items.length - 1].focus()
    } else if (!event.shiftKey && activeElement === items[items.length - 1]) {
      event.preventDefault()
      items[0].focus()
    }
  }

  return (
    <>
      <div className={`backdrop ${motion}`} onClick={exit.start} aria-hidden="true" />
      <div
        ref={panel}
        className={`${kind} ${motion}`}
        onAnimationEnd={onEnd}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        inert={covered || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </>
  )
}
