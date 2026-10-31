import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PLACE_CATEGORY_LABELS, PLACE_TYPE_LABELS, PRICE_LABELS, searchPlaces } from '../places/api'
import { PlaceDetails } from '../places/PlaceDetails'
import { PlacesSourceNote } from '../places/PlacesSourceNote'
import type { Place, PlaceFilters as Filters } from '../places/api'
import { useAddToTrip } from '../places/AddToTrip'
import { PlaceCard } from '../places/PlaceCard'
import { PlaceFilters } from '../places/PlaceFilters'
import { PlacesMap } from '../places/PlacesMap'
import { useSavedPlaces } from '../places/useSavedPlaces'
import { ViewToggle } from '../places/ViewToggle'
import type { PlacesView } from '../places/ViewToggle'

/** The seeded catalogue's destination; Explore opens here until another is given with `?destination=`. */
export const DEFAULT_EXPLORE_DESTINATION = 'Lisbon'

/** Browse places for a destination as cards or on a map, then save them or add them to a trip. */
export function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const destination = (params.get('destination') ?? '').trim() || DEFAULT_EXPLORE_DESTINATION
  const query = (params.get('q') ?? '').trim()
  const typeParam = params.get('type')
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
  const [search, setSearch] = useState(query)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [failed, setFailed] = useState(false)
  const { savedIds, toggle, ensureSaved, pendingIds, panel: savedPanel } = useSavedPlaces()
  const { onAdd, pendingPlaceId, panel } = useAddToTrip({ onAdded: (place) => void ensureSaved(place) })

  useEffect(() => {
    let current = true
    setPlaces(null)
    setFailed(false)
    searchPlaces(destination, query || undefined, { placeType, price, category }).then(
      (found) => current && setPlaces(found),
      () => current && setFailed(true),
    )
    return () => {
      current = false
    }
  }, [destination, query, placeType, price, category])

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
  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    setParam('q', search.trim() || undefined)
  }

  let body
  if (failed) {
    body = (
      <p role="alert" className="alert alert-danger">
        We couldn't load places. Try again.
      </p>
    )
  } else if (places === null) {
    body = (
      <div className="grid" role="status" aria-label="Loading places">
        {[0, 1, 2].map((n) => (
          <span key={n} className="skeleton card" style={{ aspectRatio: '4 / 3', height: 'auto' }} />
        ))}
      </div>
    )
  } else if (places.length === 0) {
    body = (
      <div className="empty-state">
        <h2>No places match</h2>
        <p>Change the search or the filters to see more places.</p>
      </div>
    )
  } else if (view === 'map') {
    body = <PlacesMap places={places} savedIds={savedIds} />
  } else {
    body = (
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
    )
  }

  return (
    <div className="stack">
      <h1>Explore</h1>
      <p className="cluster">
        <span>Places in {destination}</span>
        <Link className="btn btn-ghost" to="/">
          Change destination
        </Link>
      </p>
      {panel}
      {savedPanel}
      <form role="search" className="explore-bar" onSubmit={handleSearch}>
        <div className="field">
          <label htmlFor="explore-search">Search places</label>
          <input
            id="explore-search"
            className="input"
            type="search"
            placeholder="Search places"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>
      <PlaceFilters filters={{ placeType, price, category }} onChange={changeFilters} />
      <PlacesSourceNote places={failed ? null : places} />
      {detailsOf && <PlaceDetails place={detailsOf} onClose={() => setDetailsOf(null)} />}
      <ViewToggle
        view={view}
        onChange={(next) => setParam('view', next === 'map' ? 'map' : undefined)}
      />
      {body}
      <div>
        <Link className="btn btn-secondary" to="/explore/travel">
          Search stays, flights and transport
        </Link>
      </div>
    </div>
  )
}
