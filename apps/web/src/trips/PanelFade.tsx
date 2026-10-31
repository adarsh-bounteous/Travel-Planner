import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const GHOST_FALLBACK_MS = 1200

/**
 * The tab panel. When `tabKey` changes after mount the outgoing panel's HTML stays behind as a
 * fading ghost while the new panel fades in. The ghost is hidden from assistive technology,
 * inert and has no ids; nothing here moves focus or announces anything.
 */
export function PanelFade({ tabKey, children }: { tabKey: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lastHtml = useRef<string | null>(null)
  const lastKey = useRef(tabKey)
  const [ghost, setGhost] = useState<string | null>(null)
  const [fadingIn, setFadingIn] = useState(false)

  useLayoutEffect(() => {
    if (lastKey.current !== tabKey) {
      lastKey.current = tabKey
      if (lastHtml.current !== null) setGhost(lastHtml.current)
      setFadingIn(true)
    }
    const clone = panelRef.current?.cloneNode(true) as HTMLElement | undefined
    clone?.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
    lastHtml.current = clone?.innerHTML ?? null
  })

  const done = () => {
    setGhost(null)
    setFadingIn(false)
  }

  useEffect(() => {
    if (!ghost) return
    const timer = setTimeout(done, GHOST_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [ghost])

  return (
    <div className="panel-wrap">
      {ghost !== null && (
        <div
          className="panel-ghost"
          aria-hidden="true"
          inert
          dangerouslySetInnerHTML={{ __html: ghost }}
        />
      )}
      <div
        ref={panelRef}
        role="tabpanel"
        id={`panel-${tabKey}`}
        aria-labelledby={`tab-${tabKey}`}
        className={fadingIn ? 'panel-in' : undefined}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) done()
        }}
      >
        {children}
      </div>
    </div>
  )
}
