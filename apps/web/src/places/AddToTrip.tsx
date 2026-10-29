import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlreadyOnTripError, addPlaceToTrip, fetchTrips } from '../trips/api'
import type { Trip } from '../trips/api'
import { Toast } from '../trips/Toast'
import type { Place } from './api'
import { TripChoiceDrawer } from './TripChoiceDrawer'

type AddToast =
  | { key: number; kind: 'added'; tripId: string }
  | { key: number; kind: 'failed' | 'already' }

const ERROR_TOAST_MS = 6000
const ERROR_COPY = {
  failed: "We couldn't add that place. Try again.",
  already: 'That place is already on this trip.',
}

/**
 * Adds a place to a trip: straight away with one trip, after a choice with several, after a
 * guided New trip set-up with none (reached through the no-trips screen, which carries the place on).
 * `panel` holds the drawer, toast and messages to render.
 */
export function useAddToTrip({ onAdded }: { onAdded?: (place: Place) => void } = {}) {
  const navigate = useNavigate()
  const [place, setPlace] = useState<Place | null>(null)
  const [choice, setChoice] = useState<Trip[] | null>(null)
  const [pending, setPending] = useState(false)
  const [toast, setToast] = useState<AddToast | null>(null)

  const finish = () => {
    setChoice(null)
    setPlace(null)
    setPending(false)
  }

  const addTo = async (target: Place, tripId: string) => {
    setPending(true)
    try {
      await addPlaceToTrip(tripId, {
        place_id: target.id,
        name: target.name,
        image_url: target.image_url,
      })
      setToast({ key: Date.now(), kind: 'added', tripId })
      onAdded?.(target)
    } catch (error) {
      setToast({
        key: Date.now(),
        kind: error instanceof AlreadyOnTripError ? 'already' : 'failed',
      })
    }
    finish()
  }

  const onAdd = async (target: Place) => {
    setToast(null)
    setPlace(target)
    setPending(true)
    let trips: Trip[]
    try {
      trips = await fetchTrips()
    } catch {
      setToast({ key: Date.now(), kind: 'failed' })
      finish()
      return
    }
    if (trips.length === 1) await addTo(target, trips[0].id)
    else if (trips.length === 0) navigate('/places/add', { state: { place: target } })
    else {
      setPending(false)
      setChoice(trips)
    }
  }

  const panel = (
    <>
      {toast?.kind === 'added' && (
        <Toast
          key={toast.key}
          message="Place added"
          dismissible
          action={{ label: 'Open trip', onAction: () => navigate(`/trips/${toast.tripId}`) }}
        />
      )}
      {toast && toast.kind !== 'added' && (
        <Toast
          key={toast.key}
          tone="error"
          dismissible
          ms={ERROR_TOAST_MS}
          message={ERROR_COPY[toast.kind]}
        />
      )}
      {place && choice && (
        <TripChoiceDrawer
          trips={choice}
          pending={pending}
          onChoose={(trip) => void addTo(place, trip.id)}
          onClose={finish}
        />
      )}
    </>
  )

  return { onAdd, pendingPlaceId: pending ? place?.id : undefined, panel }
}
