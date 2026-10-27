import type { ProxyOptions } from 'vite'

export const API_PREFIXES = [
  '/auth',
  '/trips',
  '/places',
  '/saved-places',
  '/profile',
  '/shared',
  '/invites',
  '/transport',
  '/local',
  '/travel-search',
  '/startup-status',
  '/health',
]

// Several API prefixes are also client-side routes, so a page load must get the app.
// /auth stays proxied: the Google sign-in redirect is a real navigation to the API.
export function pageRequestBypass(req: {
  url?: string
  headers: { accept?: string }
}): string | undefined {
  const isAuth = req.url === '/auth' || req.url?.startsWith('/auth/') || req.url?.startsWith('/auth?')
  if (isAuth) return undefined
  return req.headers.accept?.includes('text/html') ? '/index.html' : undefined
}

export function apiProxy(apiOrigin: string): Record<string, ProxyOptions> {
  return Object.fromEntries(
    API_PREFIXES.map((prefix) => [prefix, { target: apiOrigin, bypass: pageRequestBypass }]),
  )
}
