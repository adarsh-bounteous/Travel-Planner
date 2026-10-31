import { useState } from 'react'
import { PlusIcon, XIcon } from '../auth/icons'
import { Overlay } from '../trips/Overlay'
import type { Trip } from '../trips/api'

type TripChoiceDrawerProps = {
  trips: Trip[]
  pending: boolean
  onChoose: (trip: Trip) => void
  onClose: () => void
}

/** Asks which trip a place goes to when the traveller has several. The first trip starts selected. */
export function TripChoiceDrawer({ trips, pending, onChoose, onClose }: TripChoiceDrawerProps) {
  const [selectedId, setSelectedId] = useState(trips[0]?.id)
  const selected = trips.find((t) => t.id === selectedId) ?? trips[0]
  return (
    <Overlay kind="drawer" labelledBy="trip-choice-title" onClose={onClose}>
      <div className="stack">
        <h2 id="trip-choice-title">Choose a trip</h2>
        <div className="pick-list" role="radiogroup" aria-label="Trips">
          {trips.map((trip) => (
            <label key={trip.id} className="pick">
              <input
                className="radio"
                type="radio"
                name="trip"
                checked={trip.id === selected.id}
                onChange={() => setSelectedId(trip.id)}
              />
              <span className="pick-body">
                <span className="option-title">{trip.name}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="cluster">
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending}
            onClick={() => onChoose(selected)}
          >
            <PlusIcon />
            {`Add to ${selected.name}`}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <XIcon />
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
