import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { searchPlaces } from './api'
import type { Place } from './api'
import { PlaceCard } from './PlaceCard'

export function DestinationResultsPage() {
  const query = (useSearchParams()[0].get('q') ?? '').trim()
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!query) return
    setPlaces(null)
    setFailed(false)
    searchPlaces(query).then(setPlaces, () => setFailed(true))
  }, [query])

  if (!query) return <Navigate to="/" replace />

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

  if (places === null)
    return (
      <div className="stack">
        {back}
        <div className="grid" role="status" aria-label="Loading places">
          {[0, 1, 2].map((n) => (
            <span
              key={n}
              className="skeleton card"
              style={{ aspectRatio: '4 / 3', height: 'auto' }}
            />
          ))}
        </div>
      </div>
    )

  return (
    <div className="stack">
      {back}
      {places.length === 0 ? (
        <div className="empty-state">
          <h2>No places match your search</h2>
          <p>Try a different city or place.</p>
          <Link className="btn btn-secondary" to="/">
            Change search
          </Link>
        </div>
      ) : (
        <>
          <h1>Places in {query}</h1>
          <ul className="grid">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
