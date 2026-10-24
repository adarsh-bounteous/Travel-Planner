import { HeartIcon } from '../auth/icons'
import type { Place } from './api'

type PlaceCardProps = {
  place: Place
  onAdd: (place: Place) => void
  pending?: boolean
  saved: boolean
  onToggleSave: (place: Place) => void
  savePending?: boolean
}

export function PlaceCard({
  place,
  onAdd,
  pending,
  saved,
  onToggleSave,
  savePending,
}: PlaceCardProps) {
  return (
    <li className="card stack">
      <div style={{ position: 'relative' }}>
        <img
          src={place.image_url}
          alt={place.name}
          loading="lazy"
          style={{ aspectRatio: '4 / 3', width: '100%', objectFit: 'cover' }}
        />
        {saved && (
          <span
            className="badge"
            style={{ position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)' }}
          >
            <HeartIcon filled />
            Saved
          </span>
        )}
      </div>
      <span>{place.name}</span>
      <button
        type="button"
        className={`btn ${saved ? 'btn-secondary' : 'btn-primary'}`}
        aria-pressed={saved}
        aria-label={`${saved ? 'Unsave' : 'Save'} ${place.name}`}
        disabled={savePending}
        onClick={() => onToggleSave(place)}
      >
        <HeartIcon filled={saved} />
        {saved ? 'Unsave' : 'Save'}
      </button>
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
