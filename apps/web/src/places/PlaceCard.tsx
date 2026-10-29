import { HeartIcon } from '../auth/icons'
import type { Place } from './api'
import { PlaceCover } from './PlaceCover'

type PlaceCardProps = {
  place: Place
  /** When omitted (e.g. on the Saved screen) the Add to trip button is not shown. */
  onAdd?: (place: Place) => void
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
      <PlaceCover seed={place.id} />
      <span>{place.name}</span>
      {saved && (
        <span className="badge">
          <HeartIcon filled />
          Saved
        </span>
      )}
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
      {onAdd && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Add ${place.name} to trip`}
          disabled={pending}
          onClick={() => onAdd(place)}
        >
          Add to trip
        </button>
      )}
    </li>
  )
}
