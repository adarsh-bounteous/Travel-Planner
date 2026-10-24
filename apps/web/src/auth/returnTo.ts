const KEY = 'returnTo'
const AUTH_PAGES = ['/sign-in', '/sign-up', '/confirm-email']
const LABELS: Record<string, string> = { '/': 'Trips', '/destinations': 'Destination results' }

// Only same-origin absolute paths, and never an auth page (which would loop).
export function safeReturnPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  const pathname = raw.split(/[?#]/)[0]
  return AUTH_PAGES.includes(pathname) ? null : raw
}

export function rememberReturnTo(path: string): void {
  const safe = safeReturnPath(path)
  if (safe) sessionStorage.setItem(KEY, safe)
}

export function peekReturnTo(): string | null {
  return safeReturnPath(sessionStorage.getItem(KEY))
}

export function takeReturnTo(): string | null {
  const path = peekReturnTo()
  sessionStorage.removeItem(KEY)
  return path
}

export function pageLabel(path: string): string {
  const pathname = path.split(/[?#]/)[0]
  if (pathname.startsWith('/invite/')) return 'your invite'
  return LABELS[pathname] ?? 'that page'
}
