import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { InfoIcon, CheckIcon, SearchIcon } from '../auth/icons'
import { fetchProfile } from '../trips/api'
import type { TransportPreferences } from '../trips/api'
import { formatMoney } from '../trips/stayOptions'
import { fetchTransportOptions } from './api'
import type { TransportOption } from './api'

type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; options: TransportOption[] }

const isUnset = (p: TransportPreferences) =>
  p.modes.length === 0 &&
  p.cabin === null &&
  p.departure_window === null &&
  p.max_stops === null &&
  p.providers.length === 0

function OptionCard({ option, matched }: { option: TransportOption; matched: boolean }) {
  return (
    <article className="card transport-option" role="listitem">
      <div className="transport-option-main">
        <div className="cluster">
          <span className="text-bold">{option.title}</span>
          {option.preferred_provider && (
            <span className="badge badge-success">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              &nbsp;Preferred provider
            </span>
          )}
          {option.estimate && <span className="badge">Estimate</span>}
        </div>
        <span className="text-muted text-sm">{option.detail}</span>
      </div>
      <div className="transport-option-price">
        {option.estimate ? '~' : ''}
        {formatMoney(option.price, option.currency)}
      </div>
      <div className="transport-option-foot">
        <span className="text-sm text-muted">{matched ? `Why: ${option.why}` : option.why}</span>
        <a href={option.url} target="_blank" rel="noreferrer">
          View booking
        </a>
      </div>
    </article>
  )
}

/** Find transport for a route and date. It never asks for preferences: the saved ones are applied for you. */
export function TransportSearchPage() {
  const [prefs, setPrefs] = useState<TransportPreferences | null>(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [result, setResult] = useState<Load>({ state: 'idle' })

  useEffect(() => {
    // Without a profile the strip falls back to "nothing saved"; the search itself still works.
    fetchProfile().then(
      (profile) => setPrefs(profile.transport_preferences),
      () => setPrefs(null),
    )
  }, [])

  const search = (event: FormEvent) => {
    event.preventDefault()
    setResult({ state: 'loading' })
    fetchTransportOptions(origin.trim(), destination.trim(), date).then(
      (found) => setResult({ state: 'ready', options: found.options }),
      () => setResult({ state: 'failed' }),
    )
  }

  const matched = prefs !== null && !isUnset(prefs)

  return (
    <div className="stack stack-lg page">
      <h1>Find transport</h1>
      <form className="grid search-grid" onSubmit={search}>
        <div className="field">
          <label className="field-label" htmlFor="s-from">
            From
          </label>
          <input
            className="input"
            id="s-from"
            placeholder="City"
            required
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="s-to">
            To
          </label>
          <input
            className="input"
            id="s-to"
            placeholder="City"
            required
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="s-date">
            Dates
          </label>
          <input
            className="input"
            id="s-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={result.state === 'loading'}>
          <SearchIcon />
          Search
        </button>
      </form>

      <div className={`status-strip${matched ? '' : ' is-plain'}`} aria-live="polite">
        <span className="cluster">
          {matched ? <CheckIcon /> : <InfoIcon />}
          {matched
            ? 'Matched to your saved transport preferences'
            : 'No transport preferences saved. Showing every option.'}
        </span>
        <Link to="/profile/transport">
          {matched ? 'Edit transport preferences' : 'Set transport preferences (optional)'}
        </Link>
      </div>

      <section className="stack" aria-labelledby="shortlist-h">
        <h2 id="shortlist-h">Shortlist</h2>
        {result.state === 'idle' && (
          <p className="text-muted">Enter where and when you are travelling to see your options.</p>
        )}
        {result.state === 'loading' && (
          <div className="stack" role="status" aria-label="Loading shortlist">
            {[1, 2].map((n) => (
              <div className="card stack stack-sm" key={n}>
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ))}
          </div>
        )}
        {result.state === 'failed' && (
          <p className="alert alert-danger" role="alert">
            We couldn't load transport options. Check the details and search again.
          </p>
        )}
        {result.state === 'ready' &&
          (result.options.length === 0 ? (
            <p className="text-muted">No options match. Try other dates, or edit your transport preferences.</p>
          ) : (
            <div className="stack" role="list" aria-label="Transport options">
              {result.options.map((o) => (
                <OptionCard key={o.id} option={o} matched={matched} />
              ))}
            </div>
          ))}
      </section>
    </div>
  )
}
