import { useCallback, useEffect, useRef, useState } from 'react'

/** Motion tokens from design-system/tokens.css, as var() references for inline styles. */
export const MOTION = {
  durationFast: 'var(--motion-duration-fast)',
  durationBase: 'var(--motion-duration-base)',
  durationSlow: 'var(--motion-duration-slow)',
  easeOut: 'var(--motion-ease-out)',
  easeInOut: 'var(--motion-ease-in-out)',
  distance: 'var(--motion-distance)',
} as const

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `--motion-duration-base` in milliseconds: the longest an exit animation is waited for. */
export const MOTION_MS = 220

/** Plays an exit animation: `start()` marks it leaving, then `onDone` runs when it ends (or after a fallback). */
export function useExit(onDone: () => void): { leaving: boolean; start: () => void; onAnimationEnd: () => void } {
  const [leaving, setLeaving] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  const finished = useRef(false)

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    done.current()
  }, [])

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(finish, MOTION_MS)
    return () => clearTimeout(timer)
  }, [leaving, finish])

  const start = useCallback(() => setLeaving(true), [])

  return {
    leaving,
    start,
    onAnimationEnd: () => {
      if (leaving) finish()
    },
  }
}

/** Counts from 0 up to `target`; returns `target` at once under reduced motion or without animation support. */
export function useCountUp(target: number, durationMs = 900): number {
  const instant =
    typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function' || prefersReducedMotion()
  const [value, setValue] = useState(instant ? target : 0)

  useEffect(() => {
    if (instant) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      setValue(t >= 1 ? target : target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, instant])

  return instant ? target : value
}
