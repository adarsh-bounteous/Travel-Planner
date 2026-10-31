type NavigationType = 'POP' | 'PUSH' | 'REPLACE'

/** A route change fades and slides over this long; index.css `--route-duration` must match. */
export const ROUTE_DURATION_MS = 250

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document
}

/** Forward navigation slides in from the right, going back slides in from the left. */
export function routeDirection(navType: NavigationType): 1 | -1 {
  return navType === 'POP' ? -1 : 1
}
