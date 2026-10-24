import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { EyeIcon } from '../auth/icons'
import { NotFoundError, fetchSharedTrip } from './api'
import type { Trip } from './api'
import { AccessRemovedModal } from './AccessRemovedModal'
import { ItineraryTab } from './ItineraryTab'
import { LinkUnavailable } from './LinkUnavailable'

type LoadState = 'loading' | 'ready' | 'unavailable' | 'failed'

const REFRESH_MS = 30_000

const noop = () => {}

/** The itinerary behind a read-only link, for anyone, with nothing to change it. */
export function SharedTripPage() {
  const { token = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
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
      fetchSharedTrip(token).then(setTrip, (reason) => {
        if (reason instanceof NotFoundError) setRemoved(true)
      })
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

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <span className="badge badge-neutral">
          <EyeIcon />
          Read-only
        </span>
        <h1>{trip.name}</h1>
      </div>
      <ItineraryTab
        trip={trip}
        onRename={noop}
        onAddReminder={noop}
        onEditReminder={noop}
        onAddActivity={noop}
        onMoveActivity={async () => {}}
        onRemoveActivity={noop}
      />
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
