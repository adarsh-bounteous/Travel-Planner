import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { fetchLocalMode } from '../auth/api'
import { AlertIcon, InfoIcon } from '../auth/icons'
import { PLACE_TYPE_LABELS, PRICE_LABELS, searchPlaces } from './api'
import type { Place, PlaceFilters as Filters } from './api'
import { useAddToTrip } from './AddToTrip'
import { PlaceCard } from './PlaceCard'
import { PlaceFilters } from './PlaceFilters'
import { PlacesMap } from './PlacesMap'
import { useSavedPlaces } from './useSavedPlaces'
import { ViewToggle } from './ViewToggle'
import type { PlacesView } from './ViewToggle'

export function DestinationResultsPage() {
  const [params, setParams] = useSearchParams()
  const query = (params.get('q') ?? '').trim()
  const destination = (params.get('destination') ?? '').trim()
  const area = destination || query
  const typeParam =params.get('type')
  const priceParam = params.get('price')
  const placeType =
    typeParam !== null && typeParam in PLACE_TYPE_LABELS
      ? (typeParam as Filters['placeType'])
      : undefined
  const price =
    priceParam !== null && priceParam in PRICE_LABELS ? (priceParam as Filters['price']) : undefined
  const view: PlacesView = params.get('view') === 'map' ? 'map' : 'list'
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [localMode, setLocalMode] = useState<boolean | null>(null)
  const { onAdd, pendingPlaceId, panel } = useAddToTrip()
  const { savedIds, toggle, pendingIds, panel: savedPanel } = useSavedPlaces()

  useEffect(() => {
    if (!area) return
    setPlaces(null)
    setFailed(false)
    searchPlaces(area, destination ? query || undefined : undefined, { placeType, price }).then(
      setPlaces,
      () => setFailed(true),
    )
  }, [area, destination, query, placeType, price])

  useEffect(() => {
    let current = true
    void fetchLocalMode().then((on) => current && setLocalMode(on))
    return () => {
      current = false
    }
  }, [])

  if (!area) return <Navigate to="/" replace />

  const modeNotice =
    localMode === null ? null : localMode ? (
      <p className="alert alert-info cluster">
        <InfoIcon />
        <span>
          Local mode is on. Places are generated here and no request goes to the outside places
          service.
        </span>
      </p>
    ) : (
      <p className="alert alert-warning cluster">
        <AlertIcon />
        <span>Local mode is off. Places come from the outside places service.</span>
      </p>
    )

  const setParam = (name: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value === undefined) next.delete(name)
    else next.set(name, value)
    setParams(next)
  }
  const changeFilters = (filters: Filters) => {
    const next = new URLSearchParams(params)
    for (const [name, value] of [
      ['type', filters.placeType],
      ['price', filters.price],
    ] as const) {
      if (value === undefined) next.delete(name)
      else next.set(name, value)
    }
    setParams(next)
  }
  const filtered = placeType !== undefined || price !== undefined

  const back = (
    <div>
      <Link className="btn btn-ghost" to="/">
        Back
      </Link>
    </div>
  )

  if (failed)
    return (
      <div className="stack">
        {back}
        <p role="alert" className="alert alert-danger">
          We couldn't load places. Try searching again.
        </p>
      </div>
    )

  if (places !== null && places.length === 0 && !filtered)
    return (
      <div className="stack">
        {back}
        {modeNotice}
        <div className="empty-state">
          <h2>No places match your search</h2>
          <p>Try a different city or place.</p>
          <Link className="btn btn-secondary" to="/">
            Change search
          </Link>
        </div>
      </div>
    )

  return (
    <div className="stack">
      {back}
      {modeNotice}
      <h1>Places in {area}</h1>
      {panel}
      {savedPanel}
      <PlaceFilters filters={{ placeType, price }} onChange={changeFilters} />
      <ViewToggle
        view={view}
        onChange={(next) => setParam('view', next === 'map' ? 'map' : undefined)}
      />
      {places === null ? (
        <div className="grid" role="status" aria-label="Loading places">
          {[0, 1, 2].map((n) => (
            <span
              key={n}
              className="skeleton card"
              style={{ aspectRatio: '4 / 3', height: 'auto' }}
            />
          ))}
        </div>
      ) : places.length === 0 ? (
        <div className="empty-state">
          <h2>No places match these filters</h2>
          <p>Change or clear the filters to see more places.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => changeFilters({})}
          >
            Clear filters
          </button>
        </div>
      ) : view === 'map' ? (
        <PlacesMap places={places} savedIds={savedIds} />
      ) : (
        <ul className="grid">
          {places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onAdd={onAdd}
              pending={pendingPlaceId === place.id}
              saved={savedIds.has(place.id)}
              onToggleSave={toggle}
              savePending={pendingIds.has(place.id)}
            />
          ))}
        </ul>
      )}
      {localMode && places !== null && places.length > 0 && !filtered && (
        <p className="text-muted text-sm cluster">
          <InfoIcon />
          <span>
            {places.length} {places.length === 1 ? 'place' : 'places'} generated locally for{' '}
            {area}.
          </span>
        </p>
      )}
    </div>
  )
}
