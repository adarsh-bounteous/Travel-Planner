import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Where the single underline sits: under the selected tab. The first position is set without
 * a transition; later changes (and window resizes) set `moving` so CSS can slide it.
 */
export function useTabIndicator(tablistRef: RefObject<HTMLElement | null>, selectedId: string) {
  const [box, setBox] = useState({ left: 0, width: 0 })
  const [moving, setMoving] = useState(false)
  const measured = useRef(false)

  const measure = () => {
    const selected = tablistRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!selected) return false
    setBox({ left: selected.offsetLeft, width: selected.offsetWidth })
    return true
  }

  // `selectedId` is empty until the tabs exist, so the first real position never slides.
  useLayoutEffect(() => {
    if (!measure()) return
    if (measured.current) setMoving(true)
    measured.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...box, moving }
}
