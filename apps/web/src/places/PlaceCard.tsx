import type { Place } from './api'

type PlaceCardProps = {
  place: Place
  onAdd: (place: Place) => void
  pending?: boolean
}

export function PlaceCard({ place, onAdd, pending }: PlaceCardProps) {
  return (
    <li className="card stack">
      <img
        src={place.image_url}
        alt={place.name}
        loading="lazy"
        style={{ aspectRatio: '4 / 3', width: '100%', objectFit: 'cover' }}
      />
      <span>{place.name}</span>
      <button
        type="button"
        className="btn btn-secondary"
        aria-label={`Add ${place.name} to trip`}
        disabled={pending}
        onClick={() => onAdd(place)}
      >
        Add to trip
      </button>
    </li>
  )
}
