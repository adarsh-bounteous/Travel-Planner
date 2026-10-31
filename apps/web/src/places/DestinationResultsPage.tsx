import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { fetchLocalMode } from '../auth/api'
import { AlertIcon, ArrowLeftIcon, EditIcon, InfoIcon, SearchIcon, XIcon } from '../auth/icons'
import { fetchTrip } from '../trips/api'
import type { Trip } from '../trips/api'
import { destinationLabel } from '../trips/destination'
import type { DestinationRef, DestinationStatus } from '../trips/destination'
import { DestinationGate } from '../trips/DestinationGate'
import { PLACE_CATEGORY_LABELS, PLACE_TYPE_LABELS, PRICE_LABELS, searchPlaces } from './api'
import { PlaceDetails } from './PlaceDetails'
import { PlacesSourceNote } from './PlacesSourceNote'
import type { Place, PlaceFilters as Filters } from './api'
import { fetchStarterDestinations } from './starterApi'
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
  const tripId = params.get('trip')
  const [trip, setTrip] = useState<Trip | null>(null)
  const [countries, setCountries] = useState<string[] | null>(null)
  const area = destination || query || (tripId ? (trip?.place ?? '') : '')
  const typeParam =params.get('type')
  const priceParam = params.get('price')
  const placeType =
    typeParam !== null && typeParam in PLACE_TYPE_LABELS
      ? (typeParam as Filters['placeType'])
      : undefined
  const price =
    priceParam !== null && priceParam in PRICE_LABELS ? (priceParam as Filters['price']) : undefined
  const categoryParam = params.get('category')
  const category =
    categoryParam !== null && categoryParam in PLACE_CATEGORY_LABELS
      ? (categoryParam as Filters['category'])
      : undefined
  const view: PlacesView = params.get('view') === 'map' ? 'map' : 'list'
  const [detailsOf, setDetailsOf] = useState<Place | null>(null)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [localMode, setLocalMode] = useState<boolean | null>(null)
  const { onAdd, pendingPlaceId, panel } = useAddToTrip()
  const { savedIds, toggle, pendingIds, panel: savedPanel } = useSavedPlaces()

  useEffect(() => {
    if (!area) return
    setPlaces(null)
    setFailed(false)
    searchPlaces(area, destination ? query || undefined : undefined, { placeType, price, category }).then(
      setPlaces,
      () => setFailed(true),
    )
  }, [area, destination, query, placeType, price, category])

  useEffect(() => {
    if (!tripId) return
    let current = true
    Promise.all([fetchTrip(tripId), fetchStarterDestinations()]).then(
      ([loaded, starter]) => {
        if (!current) return
        setTrip(loaded)
        setCountries(starter.map((c) => c.name))
      },
      () => current && setFailed(true),
    )
    return () => {
      current = false
    }
  }, [tripId])

  useEffect(() => {
    let current = true
    void fetchLocalMode().then((on) => current && setLocalMode(on))
    return () => {
      current = false
    }
  }, [])

  if (!area && !tripId) return <Navigate to="/" replace />

  const tripReady = tripId !== null && trip !== null && countries !== null
  const chosen: DestinationRef | null =
    tripReady && trip.country
      ? {
          country: trip.country,
          place: trip.place ?? null,
          label: destinationLabel(trip.country, trip.place ?? null),
        }
      : null
  let gateStatus: DestinationStatus = 'ready'
  if (tripReady) {
    if (!chosen || !chosen.place) gateStatus = 'no_destination'
    else if (!countries.includes(chosen.country)) gateStatus = 'no_country_data'
    else if (places !== null && places.length === 0 && !(placeType !== undefined || price !== undefined || category !== undefined))
      gateStatus = 'no_place_data'
  }
  const gated = (content: ReactNode) =>
    tripId && tripReady ? (
      <DestinationGate tripId={tripId} destination={chosen} status={gateStatus}>
        {content}
      </DestinationGate>
    ) : (
      content
    )

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
      ['category', filters.category],
    ] as const) {
      if (value === undefined) next.delete(name)
      else next.set(name, value)
    }
    setParams(next)
  }
  const filtered = placeType !== undefined || price !== undefined || category !== undefined

  const back = (
    <div>
      <Link className="btn btn-ghost" to="/">
        <ArrowLeftIcon />
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

  if (tripId && !tripReady)
    return (
      <div className="stack">
        {back}
        <p role="status">Loading destination…</p>
      </div>
    )

  if (places !== null && places.length === 0 && !filtered && !tripId)
    return (
      <div className="stack">
        {back}
        {modeNotice}
        <div className="empty-state">
          <SearchIcon />
          <h2>No places match your search</h2>
          <p>Try a different city or place.</p>
          <Link className="btn btn-secondary" to="/">
            <EditIcon />
            Change search
          </Link>
        </div>
      </div>
    )

  return (
    <div className="stack">
      {back}
      {modeNotice}
      <h1>{tripId ? 'Places' : `Places in ${area}`}</h1>
      {gated(
        <>
      {panel}
      {savedPanel}
      <PlaceFilters filters={{ placeType, price, category }} onChange={changeFilters} />
      <PlacesSourceNote places={places} />
      {detailsOf && <PlaceDetails place={detailsOf} onClose={() => setDetailsOf(null)} />}
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
          <SearchIcon />
          <h2>No places match these filters</h2>
          <p>Change or clear the filters to see more places.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => changeFilters({})}
          >
            <XIcon />
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
              onDetails={place.source === 'osm' ? setDetailsOf : undefined}
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
        </>,
      )}
    </div>
  )
}
