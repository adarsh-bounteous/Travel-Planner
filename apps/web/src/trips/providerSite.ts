/** Opens a provider's page in a new tab. Only http(s) is opened; false means it could not be opened. */
export function openProviderSite(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return false
  } catch {
    return false
  }
  const opened = window.open(url, '_blank')
  if (!opened) return false
  opened.opener = null
  return true
}
