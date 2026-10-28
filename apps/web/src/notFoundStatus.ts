import type { IncomingMessage, ServerResponse } from 'node:http'
import { isKnownAppPath } from './routePatterns'

function isUnknownPageLoad(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  if (!req.headers.accept?.includes('text/html')) return false
  const pathname = (req.url ?? '/').split('?')[0]
  // /auth stays with the proxy: the Google sign-in redirect is a real navigation to the API.
  if (pathname === '/auth' || pathname.startsWith('/auth/')) return false
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
  if (lastSegment.includes('.')) return false
  return !isKnownAppPath(pathname)
}

// The app is a single page, so the dev and preview servers answer every path with index.html and
// status 200. For a path no route matches, send the same page with 404 so the browser still loads
// the app (which shows the not-found page) and the HTTP status is honest.
export function notFoundStatusMiddleware(loadIndexHtml: (url: string) => Promise<string>) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (!isUnknownPageLoad(req)) return next()
    loadIndexHtml(req.url ?? '/').then(
      (html) => {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      },
      () => next(),
    )
  }
}
