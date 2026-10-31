import { useEffect, useState } from 'react'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { Link, useParams } from 'react-router'
import { AlertIcon, SearchIcon } from '../auth/icons'
import { clearSim, fetchSimOptions, fetchTrip, pickSim } from './api'
import type { SimOption, SimOptions } from './api'
import { DestinationGate } from './DestinationGate'
import { SimOptionCard, formatSimRange } from './SimOptionCard'
import { Toast } from './Toast'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; data: SimOptions }

const PREFERENCE_TEXT = {
  esim: ['Preference: eSIM', 'eSIM options are ranked first.'],
  physical: ['Preference: Physical SIM', 'Physical SIM options are ranked first.'],
  none: ['No SIM preference', 'Ordered by coverage, then data, then price.'],
} as const

/** SIM and eSIM options for the trip destination and dates, to compare, pick and book. */
export function SimOptionsPage() {
  const { tripId = '' } = useParams()
  const [tripName, setTripName] = useState('Trip')
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => setTripName(trip.name))
      .catch(() => undefined)
    fetchSimOptions(tripId)
      .then((data) => setResult({ state: 'ready', data }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  const toggle = async (data: SimOptions, option: SimOption) => {
    const isPicked = data.picked?.option_id === option.id
    setBusy(true)
    setProblem(false)
    try {
      const trip = isPicked ? await clearSim(tripId) : await pickSim(tripId, option.id)
      setResult({ state: 'ready', data: { ...data, picked: trip.sim ? { ...trip.sim, covers_dates: true } : null } })
      setToast({
        id: Date.now(),
        message: isPicked
          ? 'Pick removed from your trip.'
          : 'Picked. Your trip total and Book trip links now include this SIM.',
      })
    } catch {
      setProblem(true)
    } finally {
      setBusy(false)
    }
  }

  const tripLink = `/trips/${encodeURIComponent(tripId)}`
  const data = result.state === 'ready' ? result.data : null
  const stale = data?.picked && !data.options.some((o) => o.id === data.picked?.option_id) ? data.picked : null
  const [badge, note] = PREFERENCE_TEXT[data?.preference ?? 'none']
  const tripDates = data?.start_date && data.end_date ? formatSimRange(data.start_date, data.end_date) : ''
  const country = data?.destination?.country ?? ''

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/">Trips</Link>
          </li>
          <li>
            <Link to={tripLink}>{tripName}</Link>
          </li>
          <li aria-current="page">SIM options</li>
        </ol>
      </nav>
      <h1>SIM options</h1>
      {result.state === 'loading' && (
        <div className="stack" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="card" key={i}>
              <div className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {result.state === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't load SIM options. Check your connection and try again.
        </div>
      )}
      {problem && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't update your pick. Check your connection and try again.
        </div>
      )}
      {data && (
        <DestinationGate tripId={tripId} destination={data.destination} status={data.status}>
      {(data.options.length > 0 || stale) && (
        <>
          <div className="cluster">
            <span className="badge badge-neutral">{badge}</span>
            <span className="text-sm text-muted">{note}</span>
          </div>
          <p className="text-sm text-muted">
            {`Showing options that cover ${country} for ${tripDates}. Prices are for ${data.travellers.length} ${data.travellers.length === 1 ? 'traveller' : 'travellers'}.`}
          </p>
        </>
      )}
      {stale && (
        <div className="alert alert-warning" role="alert">
          <AlertIcon />
          <div>
            <div className="alert-title">Pick a new SIM</div>
            Your picked SIM no longer covers the trip dates. Pick again.
          </div>
        </div>
      )}
      {(data.options.length > 0 || stale) && (
        <div className="stack" aria-live="polite">
          {stale && (
            <SimOptionCard
              option={{
                ...stale,
                id: stale.option_id,
                countries: [],
                coverage_count: 1,
                traveller_prices: data.travellers.map((label) => ({ label, price: stale.price })),
                group_total: String(Number(stale.price) * data.travellers.length),
              }}
              country={country}
              tripDates={tripDates}
              picked
              datesNotCovered
            />
          )}
          {data.options.map((o) => (
            <SimOptionCard
              key={o.id}
              option={o}
              country={country}
              tripDates={tripDates}
              picked={data.picked?.option_id === o.id}
              busy={busy}
              onToggle={() => toggle(data, o)}
            />
          ))}
        </div>
      )}
      {data.options.length === 0 && !stale && (
        <div className="empty-state">
          <EmptyStateArt />
          <SearchIcon />
          <h2 className="text-lg">No SIM options match this destination and trip dates.</h2>
          <p className="text-muted">Try changing your trip dates and check again.</p>
          <Link className="btn btn-primary" to={tripLink}>
            Change trip dates
          </Link>
        </div>
      )}
        </DestinationGate>
      )}
      {toast && <Toast key={toast.id} message={toast.message} />}
    </div>
  )
}
