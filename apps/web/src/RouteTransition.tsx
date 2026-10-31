import { useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigationType } from 'react-router'
import type { Location } from 'react-router'
import { routeDirection, supportsViewTransitions } from './routeTransition'

/**
 * Fades and slides the page when the route changes: with the View Transitions API where the
 * browser has it, with a CSS animation otherwise. It keeps the previous page on screen until
 * the transition is ready to swap. It never moves focus or adds a live region.
 */
export function RouteTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation()
  const navType = useNavigationType()
  const [displayed, setDisplayed] = useState(location)
  const [animating, setAnimating] = useState(false)

  useLayoutEffect(() => {
    if (location === displayed) return
    if (location.pathname === displayed.pathname) {
      setDisplayed(location)
      return
    }
    document.documentElement.style.setProperty('--route-dir', String(routeDirection(navType)))
    if (supportsViewTransitions()) {
      const root = document.documentElement
      root.classList.add('vt-active')
      document
        .startViewTransition(() => flushSync(() => setDisplayed(location)))
        .finished.finally(() => root.classList.remove('vt-active'))
    } else {
      setDisplayed(location)
      setAnimating(true)
    }
    // `displayed` is deliberately left out: this runs once per router location change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location])

  // A search-only change shows straight away; a path change waits for the transition to swap.
  const shown = displayed.pathname === location.pathname ? location : displayed

  return (
    <div
      className={animating ? 'route-view route-anim' : 'route-view'}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setAnimating(false)
      }}
    >
      {children(shown)}
    </div>
  )
}
