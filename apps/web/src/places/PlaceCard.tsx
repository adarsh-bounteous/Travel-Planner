import { useEffect, useRef } from 'react'
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
  /** When given, a Details button opens the place's provider details. */
  onDetails?: (place: Place) => void
}

export function PlaceCard({
  place,
  onAdd,
  pending,
  saved,
  onToggleSave,
  savePending,
  onDetails,
}: PlaceCardProps) {
  const wasSaved = useRef(saved)
  const popped = saved && !wasSaved.current
  useEffect(() => {
    wasSaved.current = saved
  }, [saved])
  return (
    <li className="card stack lift">
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
        <HeartIcon filled={saved} className={popped ? 'heart-pop' : undefined} />
        {saved ? 'Unsave' : 'Save'}
      </button>
      {onDetails && (
        <button
          type="button"
          className="btn btn-ghost"
          aria-label={`Details for ${place.name}`}
          onClick={() => onDetails(place)}
        >
          Details
        </button>
      )}
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
