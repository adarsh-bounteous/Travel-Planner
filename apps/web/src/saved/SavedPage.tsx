import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { HeartIcon } from '../auth/icons'
import type { Place } from '../places/api'
import { PlacesMap } from '../places/PlacesMap'
import { useSavedPlaces } from '../places/useSavedPlaces'
import { ViewToggle } from '../places/ViewToggle'
import type { PlacesView } from '../places/ViewToggle'
import { Toast } from '../trips/Toast'

/** Every place the traveller has saved, across all trips, as a list or on a map. */
export function SavedPage() {
  const [params, setParams] = useSearchParams()
  const view: PlacesView = params.get('view') === 'map' ? 'map' : 'list'
  const { saved, toggle, pendingIds, panel } = useSavedPlaces()
  const [removed, setRemoved] = useState<{ key: number; place: Place } | null>(null)

  const unsave = async (place: Place) => {
    setRemoved({ key: Date.now(), place })
    await toggle(place)
  }

  const changeView = (next: PlacesView) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'map') nextParams.set('view', 'map')
    else nextParams.delete('view')
    setParams(nextParams)
  }

  let body
  if (saved === null) {
    body = (
      <div className="grid" role="status" aria-label="Loading saved places">
        {[0, 1, 2].map((n) => (
          <span key={n} className="skeleton card" style={{ aspectRatio: '4 / 3', height: 'auto' }} />
        ))}
      </div>
    )
  } else if (saved.length === 0) {
    body = (
      <div className="empty-state">
        <HeartIcon />
        <h2>No places are saved yet</h2>
        <p>Save places from Destination results to see them here.</p>
        <Link className="btn btn-primary" to="/">
          Find places
        </Link>
      </div>
    )
  } else if (view === 'map') {
    body = <PlacesMap places={saved} ariaLabel="Map of saved places" onlySaved />
  } else {
    body = (
      <>
        <p className="text-muted" aria-live="polite">
          {saved.length} saved {saved.length === 1 ? 'place' : 'places'} across all your trips
        </p>
        <ul className="grid">
          {saved.map((place) => (
            <li key={place.id} className="card stack">
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
                aria-label={`Unsave ${place.name}`}
                disabled={pendingIds.has(place.id)}
                onClick={() => unsave(place)}
              >
                <HeartIcon filled />
                Unsave
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div className="stack">
      <h1>Saved</h1>
      {panel}
      {removed && (
        <Toast
          key={removed.key}
          message={`${removed.place.name} removed from saved.`}
          undo={() => toggle(removed.place)}
        />
      )}
      <ViewToggle view={view} onChange={changeView} label="Saved view" />
      {body}
    </div>
  )
}
