import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AlertIcon } from '../auth/icons'
import { fetchActivityOptions, fetchTrip } from './api'
import type { ActivityOption, ActivityOptions } from './api'
import { DestinationGate } from './DestinationGate'
import { formatFetched, formatMoney } from './stayOptions'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; options: ActivityOptions }

function ActivityCard({ option }: { option: ActivityOption }) {
  const { currency } = option
  return (
    <article className="card stack" aria-label={option.title}>
      <h3>{option.title}</h3>
      <p>{option.provider}</p>
      <p>
        <span className="text-bold">Indicative group estimate</span> {formatMoney(option.group_estimate, currency)}
      </p>
      <p>Adult {formatMoney(option.adult_price, currency)}</p>
      {option.child_price !== null && <p>Child {formatMoney(option.child_price, currency)}</p>}
      {option.offer && <p className="badge">{option.offer}</p>}
      <ul>
        {option.prices.map((p) => (
          <li key={p.provider} data-testid="price-entry">
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {p.provider}
            </a>{' '}
            {formatMoney(p.adult_price, p.currency)}, fetched {formatFetched(p.fetched_at)}
          </li>
        ))}
      </ul>
    </article>
  )
}

/** Tickets, tours, day trips and experiences at the trip destination that fit its interests and budget. */
export function ActivityOptionsPage() {
  const { tripId = '' } = useParams()
  const [tripName, setTripName] = useState('Trip')
  const [result, setResult] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => setTripName(trip.name))
      .catch(() => undefined)
    fetchActivityOptions(tripId)
      .then((options) => setResult({ state: 'ready', options }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={`/trips/${encodeURIComponent(tripId)}`}>{tripName}</Link>
          </li>
          <li aria-current="page">Activities</li>
        </ol>
      </nav>
      <h1>Activities</h1>
      {result.state === 'loading' && <p role="status">Loading activities…</p>}
      {result.state === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't load activities. Check your connection and try again.
        </div>
      )}
      {result.state === 'ready' && (
        <DestinationGate tripId={tripId} destination={result.options.destination} status={result.options.status}>
          {result.options.options.length === 0 && (
            <div className="alert alert-warning" role="status">
              <span className="alert-title">Nothing matches your interests and budget.</span> Try to change your
              interests or budget.
            </div>
          )}
          {result.options.options.map((o) => (
            <ActivityCard key={o.id} option={o} />
          ))}
        </DestinationGate>
      )}
    </div>
  )
}
