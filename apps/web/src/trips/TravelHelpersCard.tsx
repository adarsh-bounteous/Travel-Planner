import { Link } from 'react-router'
import { CalendarIcon, CompassIcon, WalletIcon } from '../auth/icons'
import type { Trip } from './api'
import { formatTripDates } from './helperFormat'

/** The Overview tab's way into the currency and weather helpers. */
export function TravelHelpersCard({ trip }: { trip: Trip }) {
  const base = `/trips/${encodeURIComponent(trip.id)}`
  const dates = formatTripDates(trip.start_date, trip.end_date)
  return (
    <section className="card stack">
      <h3>
        <CompassIcon />
        Travel helpers
      </h3>
      <p className="text-muted">
        {trip.destination ?? trip.name} trip{dates && <>, <strong>{dates}</strong></>}. Plan your budget and
        your packing.
      </p>
      <div className="cluster">
        <Link className="btn btn-secondary" to={`${base}/currency`}>
          <WalletIcon />
          Currency helper
        </Link>
        <Link className="btn btn-secondary" to={`${base}/weather`}>
          <CalendarIcon />
          Weather helper
        </Link>
      </div>
    </section>
  )
}
