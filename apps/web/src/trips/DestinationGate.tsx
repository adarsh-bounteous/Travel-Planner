import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CompassIcon, InfoIcon, RefreshIcon } from '../auth/icons'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { Toast } from './Toast'
import type { DestinationRef, DestinationStatus } from './destination'

type Props = {
  tripId: string
  destination: DestinationRef | null
  status: DestinationStatus
  /** What a limited-data message says could not load, e.g. "visa rules". */
  feature?: string
  /** Offered as "Try again" on a limited-data message. */
  onRetry?: () => void
  children: ReactNode
}

/** Shows the trip's chosen destination, or the prompt or "no information" message when the view has nothing to show. */
export function DestinationGate({
  tripId,
  destination,
  status,
  feature = 'this information',
  onRetry,
  children,
}: Props) {
  if (status === 'no_destination' || !destination)
    return (
      <div role="status" className="empty-state">
        <EmptyStateArt />
        <CompassIcon />
        <h2>Choose a destination</h2>
        <p>Choose a country and place for this trip first.</p>
        <Link className="btn btn-primary" to={`/trips/${encodeURIComponent(tripId)}`}>
          <CompassIcon />
          Choose a destination
        </Link>
      </div>
    )
  if (status === 'limited_data')
    return (
      <>
        <div role="status" className="empty-state">
          <EmptyStateArt />
          <InfoIcon />
          <h2>Limited data for {destination.label}</h2>
          <p>
            We couldn’t load {feature} for this place. Your other pages still work. Try again in a
            moment.
          </p>
          {onRetry && (
            <button className="btn btn-secondary" type="button" onClick={onRetry}>
              <RefreshIcon />
              Try again
            </button>
          )}
        </div>
        <Toast message="Limited data for this place" tone="error" />
      </>
    )
  return (
    <>
      <p className="text-muted">
        <CompassIcon />
        Destination: {destination.label}
      </p>
      {status === 'no_country_data' && (
        <p role="status">
          <InfoIcon />
          No information available for this country
        </p>
      )}
      {status === 'no_place_data' && (
        <p role="status">
          <InfoIcon />
          No information available for this place
        </p>
      )}
      {status === 'ready' && children}
    </>
  )
}
