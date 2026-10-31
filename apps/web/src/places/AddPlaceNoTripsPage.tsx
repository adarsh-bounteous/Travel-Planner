import { Link, useLocation } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { CalendarIcon, PlusIcon } from '../auth/icons'
import { GUIDED_SETUP_PATH } from '../trips/MyTripsPage'
import type { Place } from './api'

/** Where Add to trip lands for a traveller with no trips: set one up first, then the place is added. */
export function AddPlaceNoTripsPage() {
  const place = (useLocation().state as { place?: Place } | null)?.place
  return (
    <div className="narrow stack stack-lg">
      <h1>Add a place</h1>
      <div className="empty-state">
        <EmptyStateArt />
        <CalendarIcon />
        <h2>You have no trips yet</h2>
        <p>Places live inside a trip. Set one up first and we'll add this place right after.</p>
        <Link className="btn btn-primary" to={GUIDED_SETUP_PATH} state={{ addPlace: place }}>
          <PlusIcon />
          New trip
        </Link>
      </div>
    </div>
  )
}
