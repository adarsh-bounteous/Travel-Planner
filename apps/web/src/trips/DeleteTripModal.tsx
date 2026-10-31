import { useState } from 'react'
import { TrashIcon, XIcon } from '../auth/icons'
import { deleteTrip } from './api'
import type { Trip } from './api'
import { Overlay } from './Overlay'

type DeleteTripModalProps = {
  trip: Trip
  onCancel: () => void
  onDeleted: () => void
}

export function DeleteTripModal({ trip, onCancel, onDeleted }: DeleteTripModalProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const count = trip.days?.length ?? 0

  const confirm = async () => {
    setPending(true)
    setFailed(false)
    try {
      await deleteTrip(trip.id)
      onDeleted()
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Overlay
      kind="modal"
      role="alertdialog"
      labelledBy="delete-heading"
      describedBy="delete-text"
      onClose={onCancel}
    >
      <div className="stack stack-lg">
        <h3 className="text-lg" id="delete-heading">
          <TrashIcon />
          Delete this trip?
        </h3>
        <div className="stack stack-sm" id="delete-text">
          <p>
            This permanently removes <strong>{trip.name}</strong>, its{' '}
            {count === 1 ? '1 day' : `${count} days`} and everything planned on them.
          </p>
          <p>You can't undo this.</p>
        </div>
        {failed && (
          <p className="alert alert-danger" role="alert">
            We couldn't delete this trip. Try again.
          </p>
        )}
        <div className="overlay-actions end">
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            <XIcon />
            Cancel
          </button>
          <button className="btn btn-danger" type="button" disabled={pending} onClick={confirm}>
            <TrashIcon />
            {pending ? 'Deleting…' : 'Delete trip'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
