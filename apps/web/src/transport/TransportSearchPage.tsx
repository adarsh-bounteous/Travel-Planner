import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { fetchProfile } from '../trips/api'
import type { TransportPreferences } from '../trips/api'
import { formatMoney } from '../trips/stayOptions'
import { BookingLink } from '../travel/BookingLink'
import { fetchTransportOptions } from './api'
import type { TransportOptions } from './api'

const hasPreferences = (p: TransportPreferences) =>
  p.modes.length > 0 ||
  p.cabin !== null ||
  p.departure_window !== null ||
  p.max_stops !== null ||
  p.providers.length > 0

export function TransportSearchPage() {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [saved, setSaved] = useState<boolean | null>(null)
  const [result, setResult] = useState<TransportOptions | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  // Only to say whether saved preferences are in play; the search itself never sends them.
  useEffect(() => {
    fetchProfile().then(
      (profile) => setSaved(hasPreferences(profile.transport_preferences)),
      () => setSaved(false),
    )
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setFailed(false)
    setResult(null)
    try {
      setResult(await fetchTransportOptions(origin.trim(), destination.trim(), date))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="col stack">
      <div className="stack stack-sm">
        <h1>Transport</h1>
        <p className="text-muted">Search how to get there. Your saved preferences apply on their own.</p>
      </div>
      <form className="card search-grid" onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="transport-from">
            From
          </label>
          <input id="transport-from" className="input" value={origin} required onChange={(e) => setOrigin(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="transport-to">
            To
          </label>
          <input id="transport-to" className="input" value={destination} required onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="transport-date">
            Dates
          </label>
          <input id="transport-date" className="input" type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Search
          </button>
        </div>
      </form>

      {saved !== null && (
        <div className="status-strip cluster">
          {saved ? (
            <>
              <span>Matched to your saved transport preferences</span>
              <Link to="/profile/transport">Edit transport preferences</Link>
            </>
          ) : (
            <>
              <span>No transport preferences saved. Showing every option.</span>
              <Link to="/profile/transport">Set transport preferences (optional)</Link>
            </>
          )}
        </div>
      )}

      {pending && (
        <div className="stack" role="status" aria-label="Loading">
          <span className="skeleton card" />
          <span className="skeleton card" />
        </div>
      )}
      {failed && (
        <p className="alert alert-danger" role="alert">
          We couldn't load transport options. Check the details and search again.
        </p>
      )}
      {result && (
        <ul className="stack" role="list" aria-label="Transport options">
          {result.options.map((o) => (
            <li key={o.id} className="transport-option">
              <div className="transport-option-head">
                <span className="option-title">{o.title}</span>
                <span className="badges">
                  {o.preferred_provider && <span className="badge badge-success">Preferred provider</span>}
                  {o.estimate && <span className="badge badge-warning">Estimate</span>}
                </span>
              </div>
              <p className="text-muted">{o.detail}</p>
              <p className="transport-option-price">{formatMoney(o.price, o.currency)}</p>
              <p className="text-sm">Why: {o.why}</p>
              <BookingLink className="btn btn-secondary" url={o.url}>
                View booking<span className="sr-only"> for {o.title} (opens in a new tab)</span>
              </BookingLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
