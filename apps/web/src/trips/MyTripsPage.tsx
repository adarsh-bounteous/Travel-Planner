import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowRightIcon, CompassIcon, PlusIcon, RefreshIcon, SuitcaseIcon } from '../auth/icons'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { ImageFrame } from '../components/ImageFrame'
import { illustrationRefOfTrip } from '../illustrations/registry'
import { fetchTrips } from './api'
import type { Trip } from './api'
import { countdownLabel, daysUntil, soonestUpcomingTripId } from './tripCountdown'
import { Toast } from './Toast'
import { UnmatchedBadge } from './UnmatchedBadge'

/** Where the guided set-up lives; New trip and Plan your first trip both launch it. */
export const GUIDED_SETUP_PATH = '/trips/new'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; trips: Trip[] }

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

// Date-only strings are parsed as local dates: `new Date('2027-03-04')` is UTC and can show the day before.
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return dateFormat.format(new Date(year, month - 1, day))
}

function formatDates(trip: Trip): string {
  return [trip.start_date, trip.end_date]
    .filter((d): d is string => Boolean(d))
    .map(formatDate)
    .join(' – ')
}

function TripRow({ trip, countdown }: { trip: Trip; countdown: boolean }) {
  const dates = formatDates(trip)
  const stayCount = trip.stays?.length ?? 0
  const destination =
    trip.country && trip.place ? `${trip.country}, ${trip.place}` : trip.destination
  return (
    <li className="card trip-row lift">
      <ImageFrame ratio="16/9" illustration={illustrationRefOfTrip(trip)} />
      <div className="trip-info">
        <div className="trip-title">
          <h2>
            <SuitcaseIcon />
            {trip.name}
          </h2>
          {trip.shared && <span className="badge">Shared</span>}
          {trip.destination_unmatched && <UnmatchedBadge />}
        </div>
        {destination && <p>{destination}</p>}
        {dates && <p className="text-sm text-muted">{dates}</p>}
        {countdown && trip.start_date && (
          <p className="countdown">{countdownLabel(daysUntil(trip.start_date, new Date()))}</p>
        )}
        <span className={stayCount === 0 ? 'badge badge-neutral' : 'badge badge-success'}>
          {stayCount === 0 ? 'No stays yet' : `${stayCount} ${stayCount === 1 ? 'stay' : 'stays'}`}
        </span>
      </div>
      <Link className="btn btn-secondary" to={`/trips/${trip.id}`} aria-label={`Open ${trip.name}`}>
        <ArrowRightIcon />
        Open
      </Link>
    </li>
  )
}

export function MyTripsPage() {
  const state = useLocation().state as { toast?: string } | null
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  const refresh = useCallback(() => {
    let active = true
    fetchTrips().then(
      (trips) => active && setLoad({ status: 'loaded', trips }),
      // Only the first load and Retry can fail visibly; a failed refresh keeps what is shown.
      () => active && setLoad((now) => (now.status === 'loaded' ? now : { status: 'failed' })),
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let stop = refresh()
    const again = () => {
      stop()
      stop = refresh()
    }
    const onVisible = () => document.visibilityState === 'visible' && again()
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      window.removeEventListener('focus', again)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const retry = () => {
    setLoad({ status: 'loading' })
    refresh()
  }

  const trips = load.status === 'loaded' ? load.trips : null
  const soonestId = trips ? soonestUpcomingTripId(trips, new Date()) : null

  return (
    <div className="stack stack-lg">
      <div className="page-head">
        <h2>
          <SuitcaseIcon />
          My trips
        </h2>
        <div className="cluster">
          <Link className="btn btn-secondary" to="/trips/plan">
            <CompassIcon />
            Plan from a starter destination
          </Link>
          {trips && trips.length > 0 && (
            <Link className="btn btn-primary" to={GUIDED_SETUP_PATH}>
              <PlusIcon />
              New trip
            </Link>
          )}
        </div>
      </div>
      {load.status === 'loading' && (
        <div className="stack" role="status" aria-label="Loading trips">
          <span className="skeleton card" />
          <span className="skeleton card" />
          <span className="skeleton card" />
        </div>
      )}
      {load.status === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <p className="alert-title">We couldn't load your trips.</p>
          <p>Check your connection and try again.</p>
          <div>
            <button className="btn btn-secondary" type="button" onClick={retry}>
              <RefreshIcon />
              Retry
            </button>
          </div>
        </div>
      )}
      {trips && trips.length === 0 && (
        <div className="empty-state">
          <EmptyStateArt />
          <SuitcaseIcon />
          <h2>No trips yet</h2>
          <p>Where to next? Plan your first trip and it will show up here.</p>
          <Link className="btn btn-primary btn-lg" to={GUIDED_SETUP_PATH}>
            <PlusIcon />
            Plan your first trip
          </Link>
        </div>
      )}
      {trips && trips.length > 0 && (
        <ul className="grid">
          {trips.map((trip) => (
            <TripRow key={trip.id} trip={trip} countdown={trip.id === soonestId} />
          ))}
        </ul>
      )}
      <Toast message={state?.toast ?? null} />
    </div>
  )
}
