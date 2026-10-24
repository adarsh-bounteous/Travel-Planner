import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertIcon } from '../auth/icons'
import { createTrip } from '../trips/api'
import type { Trip } from '../trips/api'
import { Overlay } from '../trips/Overlay'
import { TripFields, useTripFields } from '../trips/TripFields'

type NewTripDrawerProps = {
  onCreated: (trip: Trip) => void
  onClose: () => void
}

/** Guided New trip set-up for a traveller with no trips; the place is added once the trip is saved. */
export function NewTripDrawer({ onCreated, onClose }: NewTripDrawerProps) {
  const fields = useTripFields()
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = fields.validate()
    if (!input) return
    setFailed(false)
    setPending(true)
    try {
      onCreated(await createTrip(input))
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Overlay kind="drawer" labelledBy="new-trip-title" onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <h2 id="new-trip-title">New trip</h2>
        <TripFields {...fields} />
        {failed && (
          <p className="field-error cluster" role="status">
            <AlertIcon />
            <span>We couldn't save this trip. Try again.</span>
          </p>
        )}
        <div className="cluster">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Save trip and add place
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Overlay>
  )
}
