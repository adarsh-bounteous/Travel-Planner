import { useState } from 'react'
import type { FormEvent } from 'react'
import { addTraveller } from './api'
import type { Trip } from './api'
import { AccessSection } from './AccessSection'

type TravelersTabProps = {
  trip: Trip
  onChanged: (trip: Trip, message: string, undo?: () => void) => void
}

/** Everyone going on the trip. Only the owner can add travellers or manage who can edit. */
export function TravelersTab({ trip, onChanged }: TravelersTabProps) {
  const [name, setName] = useState('')
  const [refused, setRefused] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const travellers = trip.travellers ?? []

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    setFailed(false)
    setRefused(trimmed === '')
    if (trimmed === '') return
    setPending(true)
    try {
      const updated = await addTraveller(trip.id, trimmed)
      setName('')
      onChanged(updated, `${trimmed} added to the trip.`)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <h3 className="text-lg">Travelers</h3>
        <p className="text-muted">
          {trip.is_owner
            ? "Everyone going on this trip. Travellers don't need an account."
            : 'Everyone going on this trip. The trip owner manages this list.'}
        </p>
      </div>
      <ul className="person-list" aria-label="Travellers on this trip">
        {travellers.length === 0 ? (
          <li className="empty-state">No travellers yet. Add the first one below.</li>
        ) : (
          travellers.map((traveller) => (
            <li className="person" key={traveller.id}>
              <span className="avatar" aria-hidden="true">
                {traveller.name.charAt(0).toUpperCase()}
              </span>
              <span className="option-title">{traveller.name}</span>
            </li>
          ))
        )}
      </ul>
      {trip.is_owner && (
        <form className="stack stack-sm" onSubmit={add} noValidate>
          <div className="form-row">
            <div className={`field${refused ? ' is-invalid' : ''}`}>
              <label className="field-label" htmlFor="traveller-name">
                Traveller name
              </label>
              <input
                id="traveller-name"
                className={`input${refused ? ' is-invalid' : ''}`}
                type="text"
                autoComplete="off"
                placeholder="Traveller name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={refused || undefined}
                aria-describedby={refused ? 'traveller-name-error' : 'traveller-name-hint'}
              />
              {!refused && (
                <span className="field-hint" id="traveller-name-hint">
                  Add someone by name, for example Ana.
                </span>
              )}
            </div>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add traveller'}
            </button>
          </div>
          {refused && (
            <div className="field-error" id="traveller-name-error" role="alert">
              Enter a traveller name to add them to this trip.
            </div>
          )}
          {failed && (
            <p className="field-error" role="alert">
              We couldn't add that traveller. Try again.
            </p>
          )}
        </form>
      )}
      {trip.is_owner && <AccessSection trip={trip} onChanged={onChanged} />}
    </div>
  )
}
