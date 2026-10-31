import { AlertIcon } from '../auth/icons'
import type { Place } from './api'

/** Credits OpenStreetMap on a page that lists its places; says saved data is shown when none are. */
export function PlacesSourceNote({ places }: { places: Place[] | null }) {
  if (places === null) return null
  if (places.some((p) => p.source === 'osm'))
    return (
      <p className="text-sm text-muted">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap contributors
        </a>
      </p>
    )
  const asOf = places.find((p) => p.as_of)?.as_of
  return (
    <p className="alert alert-warning cluster">
      <AlertIcon />
      <span>
        Live data unavailable, showing saved data{asOf ? ` (as of ${asOf})` : ''}.
      </span>
    </p>
  )
}
