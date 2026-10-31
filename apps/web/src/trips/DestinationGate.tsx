import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MapPinIcon } from '../auth/icons'
import type { DestinationRef, DestinationStatus } from './destination'

type Props = {
  tripId: string
  destination: DestinationRef | null
  status: DestinationStatus
  children: ReactNode
}

/** Shows the trip's chosen destination, or the prompt or "no information" message when the view has nothing to show. */
export function DestinationGate({ tripId, destination, status, children }: Props) {
  if (status === 'no_destination' || !destination)
    return (
      <div role="status" className="empty-state">
        <MapPinIcon />
        <h2>Choose a destination</h2>
        <p>Choose a country and place for this trip first.</p>
        <Link className="btn btn-primary" to={`/trips/${encodeURIComponent(tripId)}`}>
          Choose a destination
        </Link>
      </div>
    )
  return (
    <>
      <p className="text-muted">Destination: {destination.label}</p>
      {status === 'no_country_data' && <p role="status">No information available for this country</p>}
      {status === 'no_place_data' && <p role="status">No information available for this place</p>}
      {status === 'ready' && children}
    </>
  )
}
