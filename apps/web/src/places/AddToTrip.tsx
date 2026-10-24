import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlreadyOnTripError, addPlaceToTrip, fetchTrips } from '../trips/api'
import type { Trip } from '../trips/api'
import { Toast } from '../trips/Toast'
import type { Place } from './api'
import { TripChoiceDrawer } from './TripChoiceDrawer'

type Message = 'failed' | 'already' | null

/**
 * Adds a place to a trip: straight away with one trip, after a choice with several, after a
 * guided New trip set-up with none (reached through the no-trips screen, which carries the place on).
 * `panel` holds the drawer, toast and messages to render.
 */
export function useAddToTrip() {
  const navigate = useNavigate()
  const [place, setPlace] = useState<Place | null>(null)
  const [choice, setChoice] = useState<Trip[] | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [toast, setToast] = useState<{ key: number; tripId: string } | null>(null)

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
      setToast({ key: Date.now(), tripId })
    } catch (error) {
      setMessage(error instanceof AlreadyOnTripError ? 'already' : 'failed')
    }
    finish()
  }

  const onAdd = async (target: Place) => {
    setMessage(null)
    setToast(null)
    setPlace(target)
    setPending(true)
    let trips: Trip[]
    try {
      trips = await fetchTrips()
    } catch {
      setMessage('failed')
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
      {message === 'failed' && (
        <p role="alert" className="alert alert-danger">
          We couldn't add that place. Try again.
        </p>
      )}
      {message === 'already' && (
        <p role="alert" className="alert alert-warning">
          That place is already on this trip.
        </p>
      )}
      {toast && (
        <Toast
          key={toast.key}
          message="Place added"
          action={{ label: 'Open trip', onAction: () => navigate(`/trips/${toast.tripId}`) }}
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
