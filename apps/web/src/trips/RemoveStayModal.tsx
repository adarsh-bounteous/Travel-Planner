import { useState } from 'react'
import { TrashIcon, XIcon } from '../auth/icons'
import { removeStay } from './api'
import type { Stay, Trip } from './api'
import { Overlay } from './Overlay'
import { formatRange } from './stays'

type RemoveStayModalProps = {
  tripId: string
  stay: Stay
  onClose: () => void
  onRemoved: (trip: Trip, stay: Stay) => void
}

/** Asks before taking a stay off the trip; nothing is sent until Remove is pressed. */
export function RemoveStayModal({ tripId, stay, onClose, onRemoved }: RemoveStayModalProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const remove = async () => {
    setFailed(false)
    setPending(true)
    try {
      onRemoved(await removeStay(tripId, stay.id), stay)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Overlay kind="modal" role="alertdialog" labelledBy="remove-stay-title" onClose={onClose}>
      <div className="stack stack-lg">
        <h2 id="remove-stay-title">
          <TrashIcon />
          Remove this stay?
        </h2>
        <p>
          <strong>{`${stay.place}, ${formatRange(stay.start_date, stay.end_date)}`}</strong> will be removed from
          this trip.
        </p>
        {failed && (
          <p className="field-error" role="alert">
            We couldn't remove that stay. Try again.
          </p>
        )}
        <div className="overlay-actions end">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <XIcon />
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={remove}>
            <TrashIcon />
            {pending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
