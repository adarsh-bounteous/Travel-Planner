import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { addTraveller } from './api'
import type { Traveller, Trip } from './api'
import { AccessSection } from './AccessSection'
import { CompanionDetailsDrawer } from './CompanionDetailsDrawer'
import { RemoveTravellerModal } from './RemoveTravellerModal'

type Panel = { id: 'edit' | 'remove'; traveller: Traveller }

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
  const [panel, setPanel] = useState<Panel | null>(null)
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
      {trip.is_owner ? (
        <div className="stack">
          <p className="text-muted">
            Visa and medical needs are worked out for each person. Details for companions stay with
            this trip only.
          </p>
          <div className="card traveller">
            <h2 className="text-lg">You (owner)</h2>
          </div>
          {travellers.length === 0 && (
            <p className="text-muted">
              Only you are travelling, so there are no companion details to add.
            </p>
          )}
          {travellers.map((traveller) => (
            <div className="card traveller" key={traveller.id}>
              <div className="traveller-actions between">
                <h2 className="text-lg">{traveller.name}</h2>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  aria-label={`Remove ${traveller.name}`}
                  onClick={() => setPanel({ id: 'remove', traveller })}
                >
                  Remove
                </button>
              </div>
              {(
                [
                  ['Citizenship', traveller.citizenship],
                  ['Residence', traveller.residence],
                  ['Health status', traveller.health_status],
                ] as const
              ).map(([label, value]) => (
                <p key={label}>
                  <span className="k">{label}:</span>{' '}
                  {value ? value : <span className="missing">Not yet entered</span>}
                </p>
              ))}
              <div className="traveller-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  aria-label={`Edit details for ${traveller.name}`}
                  onClick={() => setPanel({ id: 'edit', traveller })}
                >
                  Edit details
                </button>
              </div>
            </div>
          ))}
          <div className="traveller-actions">
            <Link
              className="btn btn-primary"
              to={`/trips/${encodeURIComponent(trip.id)}/requirements`}
            >
              View trip requirements
            </Link>{' '}
            <Link
              className="btn btn-secondary"
              to={`/trips/${encodeURIComponent(trip.id)}/medical-guidance`}
            >
              Medical guidance
            </Link>
            <Link
              className="btn btn-secondary"
              to={`/trips/${encodeURIComponent(trip.id)}/visa-requirements`}
            >
              Visa requirements
            </Link>
          </div>
        </div>
      ) : (
        <ul className="person-list" aria-label="Travellers on this trip">
          {travellers.length === 0 ? (
            <li className="empty-state">No travellers yet.</li>
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
      )}
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
      {panel?.id === 'edit' && (
        <CompanionDetailsDrawer
          tripId={trip.id}
          traveller={panel.traveller}
          onClose={() => setPanel(null)}
          onSaved={(updated, who) => {
            setPanel(null)
            onChanged(updated, `${who} details saved.`)
          }}
        />
      )}
      {panel?.id === 'remove' && (
        <RemoveTravellerModal
          tripId={trip.id}
          traveller={panel.traveller}
          onClose={() => setPanel(null)}
          onRemoved={(updated, who) => {
            setPanel(null)
            onChanged(updated, `${who} removed from this trip.`)
          }}
        />
      )}
    </div>
  )
}
