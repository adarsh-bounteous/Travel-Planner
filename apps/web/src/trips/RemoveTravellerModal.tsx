import { useState } from 'react'
import { removeTraveller } from './api'
import type { Traveller, Trip } from './api'
import { Overlay } from './Overlay'

type RemoveTravellerModalProps = {
  tripId: string
  traveller: Traveller
  onClose: () => void
  onRemoved: (trip: Trip, name: string) => void
}

/** Asks before taking a companion, and their details, off the trip; nothing is sent until Remove is pressed. */
export function RemoveTravellerModal({
  tripId,
  traveller,
  onClose,
  onRemoved,
}: RemoveTravellerModalProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const remove = async () => {
    setFailed(false)
    setPending(true)
    try {
      onRemoved(await removeTraveller(tripId, traveller.id), traveller.name)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Overlay kind="modal" labelledBy="remove-traveller-title" onClose={onClose}>
      <div className="stack stack-lg">
        <h2 id="remove-traveller-title">Remove {traveller.name} from this trip?</h2>
        <p className="text-muted">Their details will be removed from this trip.</p>
        {failed && (
          <p className="field-error" role="alert">
            We couldn't remove that traveller. Try again.
          </p>
        )}
        <div className="overlay-actions end">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={remove}>
            {pending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
