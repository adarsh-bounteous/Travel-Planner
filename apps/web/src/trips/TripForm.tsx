import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertIcon } from '../auth/icons'
import { createTrip } from './api'
import type { TripInput } from './api'

const EMPTY = { name: '', destination: '', start_date: '', end_date: '' }

/** Create a trip. Editing an existing trip happens on its page, in the settings drawer. */
export function TripForm() {
  const navigate = useNavigate()
  const [values, setValues] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (field: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues({ ...values, [field]: event.target.value })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (values.name.trim() === '') {
      setError('Enter a trip name to save this trip.')
      return
    }
    setError(null)
    setPending(true)
    const trip: TripInput = {
      name: values.name.trim(),
      destination: values.destination.trim() || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      budget: null,
    }
    try {
      await createTrip(trip)
      navigate('/')
    } catch {
      setError("We couldn't save this trip. Try again.")
      setPending(false)
    }
  }

  return (
    <form className="col stack" noValidate onSubmit={submit}>
      <h1>New trip</h1>
      <div className="field">
        <label className="field-label" htmlFor="trip-name">
          Trip name
        </label>
        <input
          className={`input${error ? ' is-invalid' : ''}`}
          id="trip-name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'trip-name-error' : undefined}
          maxLength={120}
          value={values.name}
          onChange={set('name')}
        />
        {error && (
          <p className="field-error cluster" id="trip-name-error" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="trip-destination">
          Destination
        </label>
        <input
          className="input"
          id="trip-destination"
          maxLength={120}
          value={values.destination}
          onChange={set('destination')}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="trip-start">
          Start date
        </label>
        <input
          className="input"
          id="trip-start"
          type="date"
          value={values.start_date}
          onChange={set('start_date')}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="trip-end">
          End date
        </label>
        <input
          className="input"
          id="trip-end"
          type="date"
          value={values.end_date}
          onChange={set('end_date')}
        />
      </div>
      <div className="cluster">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Save trip
        </button>
        <Link className="btn btn-ghost" to="/">
          Cancel
        </Link>
      </div>
    </form>
  )
}
