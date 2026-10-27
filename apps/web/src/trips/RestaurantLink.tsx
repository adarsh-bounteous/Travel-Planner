import { safeHref } from './safeHref'

/** A restaurant's reservation or listing page, or a clear no-link state. Booking happens on that page. */
export function RestaurantLink({ name, url }: { name: string; url: string | null | undefined }) {
  const href = safeHref(url)
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`View listing for ${name}`}>
      View listing
    </a>
  ) : (
    <span className="text-muted text-sm">No booking link available</span>
  )
}
