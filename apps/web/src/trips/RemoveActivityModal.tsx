import { useState } from 'react'
import { TrashIcon, XIcon } from '../auth/icons'
import { removeActivity } from './api'
import type { Activity, Trip } from './api'
import { Overlay } from './Overlay'

type RemoveActivityModalProps = {
  tripId: string
  activity: Activity
  onClose: () => void
  onRemoved: (trip: Trip, activity: Activity) => void
}

/** Asks before taking an activity off its day; nothing is sent until Remove is pressed. */
export function RemoveActivityModal({ tripId, activity, onClose, onRemoved }: RemoveActivityModalProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const remove = async () => {
    setFailed(false)
    setPending(true)
    try {
      onRemoved(await removeActivity(tripId, activity.id), activity)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Overlay kind="modal" labelledBy="remove-activity-title" onClose={onClose}>
      <div className="stack stack-lg">
        <h2 id="remove-activity-title">
          <TrashIcon />
          Remove this activity?
        </h2>
        <p>
          <strong>{activity.name}</strong> will be removed from this day.
        </p>
        {failed && (
          <p className="field-error" role="alert">
            We couldn't remove that activity. Try again.
          </p>
        )}
        <div className="overlay-actions end">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
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
