import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { fetchTrips } from './api'
import type { Trip } from './api'
import { Toast } from './Toast'

export function MyTripsPage() {
  const state = useLocation().state as { toast?: string } | null
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchTrips().then(setTrips, () => setFailed(true))
  }, [])

  if (failed) return <p role="alert">We couldn't load your trips. Reload to try again.</p>
  if (trips === null) return <span className="spinner" role="status" aria-label="Loading" />

  return (
    <div className="stack">
      <h1>Your trips</h1>
      {trips.length === 0 ? (
        <p>
          You haven't planned a trip yet. When you do, it will show up here on every device you
          sign in from.
        </p>
      ) : (
        <ul className="stack">
          {trips.map((trip) => (
            <li key={trip.id} className="card">
              <Link to={`/trips/${trip.id}`}>
                {trip.name}
                {trip.destination ? ` – ${trip.destination}` : ''}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Link className="btn btn-primary" to="/trips/new">
          New trip
        </Link>
      </div>
      <Toast message={state?.toast ?? null} />
    </div>
  )
}
