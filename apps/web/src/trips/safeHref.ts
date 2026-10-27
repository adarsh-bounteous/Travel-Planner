/** Only http(s) pages are opened, so a stored `javascript:` URL can never become a link. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
