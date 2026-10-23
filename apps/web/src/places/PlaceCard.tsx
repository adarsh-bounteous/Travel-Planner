import type { Place } from './api'

export function PlaceCard({ place }: { place: Place }) {
  return (
    <li className="card stack">
      <img
        src={place.image_url}
        alt={place.name}
        loading="lazy"
        style={{ aspectRatio: '4 / 3', width: '100%', objectFit: 'cover' }}
      />
      <span>{place.name}</span>
    </li>
  )
}
