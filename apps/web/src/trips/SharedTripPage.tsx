import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { EyeIcon, InfoIcon } from '../auth/icons'
import { NotFoundError, fetchSharedTrip } from './api'
import type { SharedTrip } from './api'
import { AccessRemovedModal } from './AccessRemovedModal'
import { ItineraryDocument } from './ItineraryDocument'
import { LinkUnavailable } from './LinkUnavailable'

type LoadState = 'loading' | 'ready' | 'unavailable' | 'failed'

const REFRESH_MS = 30_000

/** The itinerary behind a read-only link, for anyone, with nothing to change it. */
export function SharedTripPage() {
  const { token = '' } = useParams()
  const [trip, setTrip] = useState<SharedTrip | null>(null)
  const [load, setLoad] = useState<LoadState>('loading')
  const [removed, setRemoved] = useState(false)

  useEffect(() => {
    fetchSharedTrip(token).then(
      (loaded) => {
        setTrip(loaded)
        setLoad('ready')
      },
      (reason) => setLoad(reason instanceof NotFoundError ? 'unavailable' : 'failed'),
    )
  }, [token])

  // An open viewer re-fetches on focus and every 30 s, so a link turned off meanwhile is noticed.
  // The server refuses it at once; this is how the open page finds out.
  const open = load === 'ready'
  useEffect(() => {
    if (!open) return
    const recheck = () =>
      fetchSharedTrip(token).then(
        // An itinerary the visitor already has stays until they reload, even if the owner switched it off.
        (next) => setTrip((prev) => (prev?.itinerary_shared && !next.itinerary_shared ? prev : next)),
        (reason) => {
          if (reason instanceof NotFoundError) setRemoved(true)
        },
      )
    const timer = setInterval(recheck, REFRESH_MS)
    window.addEventListener('focus', recheck)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', recheck)
    }
  }, [open, token])

  if (load === 'loading')
    return (
      <div className="stack" role="status" aria-label="Loading">
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    )
  if (load === 'unavailable') return <LinkUnavailable />
  if (load === 'failed' || trip === null)
    return <p role="alert">We couldn't load this trip. Reload to try again.</p>

  const badge = (
    <span className="badge badge-neutral">
      <EyeIcon />
      Read-only
    </span>
  )

  return (
    <div className="stack stack-lg">
      {trip.itinerary_shared && trip.itinerary ? (
        <>
          {badge}
          <ItineraryDocument itinerary={trip.itinerary} readOnly />
        </>
      ) : (
        <>
          <div className="stack stack-sm">
            {badge}
            <h1>{trip.name}</h1>
          </div>
          <div className="alert alert-info" role="status">
            <InfoIcon />
            <p>
              <span className="alert-title">The itinerary isn’t shared.</span> Ask the trip owner if you’d like
              to see the day-by-day plan.
            </p>
          </div>
        </>
      )}
      {removed && (
        <AccessRemovedModal
          text="The owner has turned off this read-only link."
          action="Close"
          onOk={() => setLoad('unavailable')}
        />
      )}
    </div>
  )
}
