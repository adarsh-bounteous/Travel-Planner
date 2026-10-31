import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { AlertIcon, HeartIcon, RefreshIcon, SearchIcon } from '../auth/icons'
import { fetchStayOptions, fetchTrip, stayQuery } from './api'
import type { Stay, StayCriteria, StayOptions } from './api'
import { PropertyCard } from './PropertyCard'
import { StayFilters } from './StayFilters'
import { DEFAULT_CRITERIA, describeCriteria, formatMoney, plural } from './stayOptions'
import { formatRange } from './stays'
import { Toast } from './Toast'

type Source = 'load' | 'apply' | 'relax' | 'widen'
type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; options: StayOptions }

/** Hotels, homestays and other accommodation for one Stay, gathered from several providers. */
export function StayOptionsPage() {
  const { tripId = '', stayId = '' } = useParams()
  const [tripName, setTripName] = useState('Trip')
  const [stay, setStay] = useState<Stay | null>(null)
  const [missing, setMissing] = useState(false)
  const [draft, setDraft] = useState<StayCriteria>(DEFAULT_CRITERIA)
  const [applied, setApplied] = useState<StayCriteria>(DEFAULT_CRITERIA)
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [stillEmpty, setStillEmpty] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const latest = useRef(0)

  const run = useCallback(
    (criteria: StayCriteria, source: Source) => {
      const request = ++latest.current
      setDraft(criteria)
      setApplied(criteria)
      setResult({ state: 'loading' })
      fetchStayOptions(tripId, stayId, criteria)
        .then((options) => {
          if (request !== latest.current) return
          setStillEmpty(source === 'relax' && options.properties.length === 0)
          setResult({ state: 'ready', options })
        })
        .catch(() => request === latest.current && setResult({ state: 'failed' }))
    },
    [tripId, stayId],
  )

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => {
        const found = trip.stays?.find((s) => s.id === stayId)
        setTripName(trip.name)
        if (!found) return setMissing(true)
        setStay(found)
        run(DEFAULT_CRITERIA, 'load')
      })
      .catch(() => setMissing(true))
  }, [tripId, stayId, run])

  const notify = (message: string) => setToast({ id: Date.now(), message })
  const relax = () => {
    notify('Optional filters and budget cleared.')
    run({ ...applied, max_price: null, location: '', amenities: [], stars: [] }, 'relax')
  }
  const widen = () => {
    notify(`Searching ${stay?.place} and nearby towns.`)
    run({ ...applied, widen: true }, 'widen')
  }

  if (missing)
    return (
      <div className="alert alert-danger" role="alert">
        <span className="alert-title">We couldn't find that stay.</span> Go back to your trip and try again.{' '}
        <Link to={`/trips/${encodeURIComponent(tripId)}`}>Back to trip</Link>
      </div>
    )
  if (!stay) return null

  const loading = result.state === 'loading'
  const options = result.state === 'ready' ? result.options : null
  const place = `${stay.place}${applied.widen ? ' and nearby' : ''}`

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={`/trips/${encodeURIComponent(tripId)}`}>{tripName}</Link>
          </li>
          <li aria-current="page">Stays</li>
        </ol>
      </nav>
      <h1>{`Stays in ${place}, ${formatRange(stay.start_date, stay.end_date)}`}</h1>
      {stillEmpty && options && options.properties.length === 0 && (
        <div className="alert alert-warning" role="alert">
          <span className="alert-title">Still no match.</span> Nothing fits that many rooms of this type in{' '}
          {stay.place}. Try widening the search.
        </div>
      )}
      <div className="options-body">
        <StayFilters
          criteria={draft}
          currency="EUR"
          loading={loading}
          onChange={setDraft}
          onApply={() => run(draft, 'apply')}
        />
        <section aria-labelledby="results-count" aria-busy={loading}>
          {loading && (
            <div className="stack">
              {[1, 2, 3].map((n) => (
                <div className="card sk-card" key={n}>
                  <span className="skeleton" />
                  <span className="skeleton" />
                  <span className="skeleton" />
                </div>
              ))}
            </div>
          )}
          {result.state === 'failed' && (
            <div className="alert alert-danger stack" role="alert">
              <span>
                <AlertIcon />
                We couldn't load stays. Check your connection and try again.
              </span>
              <button className="btn btn-secondary" type="button" onClick={() => run(applied, 'apply')}>
                <RefreshIcon />
                Retry
              </button>
            </div>
          )}
          {options && options.properties.length > 0 && (
            <div className="stack">
              <div>
                <div className="row-between">
                  <p className="text-bold" id="results-count" role="status">
                    {`Showing ${plural(options.properties.length, 'stay', 'stays')}`}
                  </p>
                  <Link
                    className="btn btn-secondary"
                    to={`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/shortlist?${stayQuery(applied)}`}
                  >
                    <HeartIcon />
                    View shortlist
                  </Link>
                </div>
                {options.price_min !== null && options.price_max !== null && (
                  <p className="text-sm text-muted">
                    {`Prices from ${formatMoney(options.price_min, currencyOf(options))} to ${formatMoney(options.price_max, currencyOf(options))} per night, as fetched.`}
                  </p>
                )}
              </div>
              {options.properties.map((p) => (
                <PropertyCard key={p.id} property={p} nights={options.nights} />
              ))}
            </div>
          )}
          {options && options.properties.length === 0 && (
            <div className="empty-state">
              <EmptyStateArt />
              <SearchIcon />
              <h2>No stays match</h2>
              <p>No stays match your property type, rooms and filters.</p>
              <p className="text-sm">{describeCriteria(applied, stay.place)}</p>
              <div className="actions-end">
                <button className="btn btn-primary" type="button" onClick={relax}>
                  <RefreshIcon />
                  Relax filters
                </button>
                <button className="btn btn-secondary" type="button" onClick={widen}>
                  <SearchIcon />
                  Widen search
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      {toast && <Toast key={toast.id} message={toast.message} />}
    </div>
  )
}

const currencyOf = (options: StayOptions) => options.properties[0].offers[0].currency
