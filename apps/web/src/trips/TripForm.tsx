import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { createTrip } from './api'
import { TripFields, useTripFields } from './TripFields'

/** Create a trip. Editing an existing trip happens on its page, in the settings drawer. */
export function TripForm() {
  const navigate = useNavigate()
  const fields = useTripFields()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trip = fields.validate()
    if (!trip) return
    setError(null)
    setPending(true)
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
      <TripFields {...fields} />
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
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
