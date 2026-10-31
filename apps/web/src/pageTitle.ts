import { useEffect, useLayoutEffect } from 'react'
import { matchPath, useLocation } from 'react-router'

export const APP_NAME = 'Travel Planner'

/** "Page name - Travel Planner", or just the app name when the page has no name. */
export function formatTitle(pageName?: string | null): string {
  const name = pageName?.trim()
  return name ? `${name} - ${APP_NAME}` : APP_NAME
}

// One entry per route in routePatterns.ts (a test keeps them in step), named after the page's h1.
// A page that shows a trip's own name calls usePageName once it has loaded; the entry here is
// what shows until then. The catch-all has no name.
export const PAGE_NAMES: { pattern: string; name?: string }[] = [
  { pattern: '/', name: 'My trips' },
  { pattern: '/destinations', name: 'Places' },
  { pattern: '/explore', name: 'Explore' },
  { pattern: '/explore/travel', name: 'Search travel' },
  { pattern: '/explore/travel/booking', name: 'Booking option' },
  { pattern: '/account/local-mode', name: 'Local mode' },
  { pattern: '/saved', name: 'Saved' },
  { pattern: '/account', name: 'Account' },
  { pattern: '/profile', name: 'Traveller profile' },
  { pattern: '/profile/transport', name: 'Transport preferences' },
  { pattern: '/transport', name: 'Transport' },
  { pattern: '/trips/new', name: 'New trip' },
  { pattern: '/trips/:tripId/currency', name: 'Currency helper' },
  { pattern: '/trips/:tripId/weather', name: 'Weather helper' },
  { pattern: '/trips/:tripId/medical-guidance', name: 'Medical guidance' },
  { pattern: '/trips/:tripId/requirements', name: 'Trip requirements' },
  { pattern: '/trips/:tripId/visa-requirements', name: 'Visa requirements' },
  { pattern: '/trips/:tripId/shortlists', name: 'Shortlists' },
  { pattern: '/trips/:tripId/costs', name: 'Costs' },
  { pattern: '/trips/:tripId/itinerary', name: 'Itinerary' },
  { pattern: '/places/add', name: 'Add a place' },
  { pattern: '/trips/:tripId', name: 'Trip' },
  { pattern: '/trips/:tripId/sim-options', name: 'SIM options' },
  { pattern: '/trips/:tripId/activity-options', name: 'Activities' },
  { pattern: '/trips/:tripId/restaurant-options', name: 'Restaurants' },
  { pattern: '/trips/:tripId/restaurant-options/:view', name: 'Restaurants' },
  { pattern: '/trips/:tripId/insurance-options', name: 'Insurance options' },
  { pattern: '/trips/:tripId/insurance-options/compare', name: 'Compare plans' },
  { pattern: '/trips/plan', name: 'Plan a trip' },
  { pattern: '/trips/plan/:country/:place', name: 'Plan a trip' },
  { pattern: '/trips/:tripId/stays/:stayId/options', name: 'Stays' },
  { pattern: '/trips/:tripId/stays/:stayId/shortlist', name: 'Compare stays' },
  { pattern: '/trips/:tripId/flights', name: 'Flights' },
  { pattern: '/trips/read-only/:token', name: 'Shared trip' },
  { pattern: '/invite/:token', name: 'Invitation' },
  { pattern: '/local/inbox', name: 'Emails' },
  { pattern: '/local/google-consent', name: 'Google consent' },
  { pattern: '/sign-in', name: 'Sign in' },
  { pattern: '/sign-up', name: 'Sign up' },
  { pattern: '/confirm-email', name: 'Confirm your email' },
  { pattern: '/confirm-email/:token', name: 'Confirm your email' },
]

/** Set the tab title to a name only known once the page has loaded. */
export function usePageName(name?: string | null): void {
  useEffect(() => {
    if (name) document.title = formatTitle(name)
  }, [name])
}

/** Sets the title for the current route; mounted once next to the header. */
export function TitleManager(): null {
  const { pathname } = useLocation()
  // A layout effect runs before the page's own passive effect, so a page's usePageName wins.
  useLayoutEffect(() => {
    const entry = PAGE_NAMES.find((p) => matchPath(p.pattern, pathname) !== null)
    document.title = formatTitle(entry?.name)
  }, [pathname])
  return null
}
