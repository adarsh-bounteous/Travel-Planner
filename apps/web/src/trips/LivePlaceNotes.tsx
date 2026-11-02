import { useEffect, useState } from 'react'
import { CompassIcon, InfoIcon } from '../auth/icons'
import { fetchDataStatus } from './api'
import type { DataStatus, Trip } from './api'

const FEATURES = [
  ['recommendations', 'Recommendations'],
  ['visa', 'Visa rules'],
  ['itinerary', 'Itinerary'],
] as const

/** Which data a trip to a live place has: starter trips have it all, so they show nothing. */
export function DataStatusCard({ trip }: { trip: Trip }) {
  const [status, setStatus] = useState<DataStatus | null>(null)
  const live = trip.place_source === 'live'

  useEffect(() => {
    if (!live) return
    let current = true
    fetchDataStatus(trip.id).then(
      (found) => current && setStatus(found),
      () => current && setStatus(null),
    )
    return () => {
      current = false
    }
  }, [trip.id, live])

  if (!live || !status) return null
  return (
    <section className="card stack" aria-labelledby="data-status-heading">
      <h2 id="data-status-heading">
        <CompassIcon />
        Data for {status.destination?.label ?? trip.destination}
      </h2>
      <div>
        {FEATURES.map(([key, label]) => (
          <div className="status-row" key={key}>
            <span>{label}</span>
            {status.features[key] === 'available' ? (
              <span className="badge badge-success">Available</span>
            ) : (
              <span className="badge badge-warning">Limited</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Says an old trip was matched to a live place the traveller picked before. */
export function RematchNote({ trip }: { trip: Trip }) {
  if (!trip.rematched_from) return null
  return (
    <p className="alert alert-info cluster">
      <InfoIcon />
      <span>
        Saved as “{trip.rematched_from}”. We matched it to {trip.destination}, which you picked
        before.
      </span>
    </p>
  )
}
