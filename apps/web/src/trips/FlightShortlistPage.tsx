import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { AlertIcon, CheckIcon, ChevronDownIcon, SearchIcon } from '../auth/icons'
import { fetchFlightShortlist, fetchTrip, pickTransport } from './api'
import type { FlightShortlist, ShortlistFlight, TransportLeg, Trip } from './api'
import { FlightShortlistCard } from './FlightShortlistCard'
import { formatFare, formatLegDate, formatMode, legName, LEGS } from './flights'
import { Toast } from './Toast'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; shortlist: FlightShortlist }

const LOADING_LABEL = 'Loading travel options'
const SKELETON_WIDTHS = ['50%', '30%', '60%']

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)

function budgetLine(trip: Trip) {
  if (trip.budget == null || !trip.cost) return null
  const currency = trip.currency ?? trip.cost.currency
  const left = trip.budget - trip.cost.total
  const budget = `Your trip budget is ${formatFare(trip.budget, currency)}`
  return left >= 0
    ? `${budget} and you have ${formatFare(left, currency)} left.`
    : `${budget} and you are ${formatFare(-left, currency)} over.`
}

/** The ranked flights for one leg, addressed by origin, destination and date. Budget-fitting ones come first. */
export function FlightShortlistPage() {
  const { tripId = '' } = useParams()
  const [query] = useSearchParams()
  const navigate = useNavigate()
  const origin = query.get('origin') ?? ''
  const destination = query.get('destination') ?? ''
  const date = query.get('date') ?? ''
  const [trip, setTrip] = useState<Trip | null>(null)
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [explaining, setExplaining] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [toastKey, setToastKey] = useState<number | null>(null)
  const [pickFailed, setPickFailed] = useState(false)
  const [pickToast, setPickToast] = useState<{ id: number; message: string } | null>(null)
  const legParam = query.get('leg')
  const leg = LEGS.find((l) => l === legParam)

  const load = useCallback(() => {
    setResult({ state: 'loading' })
    fetchFlightShortlist(tripId, origin, destination, date)
      .then((shortlist) => {
        setResult({ state: 'ready', shortlist })
        // The toast reports a missing source once, not on every retry.
        if (shortlist.sources.some((s) => s.status !== 'ok')) setToastKey((key) => key ?? Date.now())
      })
      .catch(() => setResult({ state: 'failed' }))
      .finally(() => setRetrying(false))
  }, [tripId, origin, destination, date])

  useEffect(() => {
    fetchTrip(tripId)
      .then(setTrip)
      .catch(() => setTrip(null))
    load()
  }, [tripId, load])

  const legPick = trip?.transport?.find((p) => p.leg === leg)
  const canPick = trip?.can_edit ?? trip?.is_owner ?? false

  const pick = async (pickedLeg: TransportLeg, item: ShortlistFlight) => {
    if (legPick?.option_id === item.flight.id) return
    setPickFailed(false)
    try {
      const updated = await pickTransport(tripId, pickedLeg, { origin, destination, date, optionId: item.flight.id })
      setTrip(updated)
      const who = item.flight.provider
      setPickToast({
        id: Date.now(),
        message: legPick ? `Picked ${who}. Your earlier pick is replaced.` : `Picked ${who}. Added to your trip total.`,
      })
    } catch {
      setPickFailed(true)
    }
  }

  const retry = () => {
    setRetrying(true)
    load()
  }

  const tripHref = `/trips/${encodeURIComponent(tripId)}`
  const shortlist = result.state === 'ready' ? result.shortlist : null
  const flights = shortlist?.flights ?? []
  // Each group keeps the API's order; nothing is filtered out by budget.
  const ordered = [...flights.filter((f) => f.fits_budget), ...flights.filter((f) => !f.fits_budget)]
  const missing = shortlist?.sources.filter((s) => s.status !== 'ok') ?? []
  const answered = shortlist?.sources.filter((s) => s.status === 'ok') ?? []
  const heading = `Travel options, ${origin} to ${destination}, ${date ? formatLegDate(date) : ''}`
  const line = trip ? budgetLine(trip) : null

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to={tripHref}>{trip?.name ?? 'Trip'}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{`${origin} to ${destination}`}</span>
      </nav>
      <h1>{heading}</h1>
      {line && <p>{line}</p>}
      {shortlist && answered.length > 0 && (
        <div className="strip">
          <div className="src-row" aria-label="Fare sources">
            <span className="text-sm text-muted">Fares from</span>
            {answered.map((s) => (
              <span className="badge badge-success" key={s.name}>
                <CheckIcon />
                {s.name}
              </span>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            aria-expanded={explaining}
            aria-controls="how-rank"
            onClick={() => setExplaining((open) => !open)}
          >
            How we rank
            <ChevronDownIcon />
          </button>
          {explaining && (
            <p className="text-sm text-muted" id="how-rank">
              Fare counts most. Travel time, fewer stops and a fit with your saved transport preferences settle
              the rest. Flights that fit your trip budget come first.
            </p>
          )}
        </div>
      )}
      {leg && <h2>{legName(leg, trip?.destination ?? destination)}</h2>}
      {pickFailed && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't save your pick. Check your connection and try again.
        </div>
      )}
      {pickToast && <Toast key={pickToast.id} message={pickToast.message} />}
      {toastKey !== null &&<Toast key={toastKey} message="Some flight sources did not respond. Showing the rest." />}
      {result.state === 'loading' && (
        <div className="stack" role="group" aria-label={LOADING_LABEL} aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div className="card stack stack-sm" key={n}>
              {SKELETON_WIDTHS.map((width) => (
                <span className="skeleton" style={{ width }} key={width} />
              ))}
            </div>
          ))}
        </div>
      )}
      {result.state === 'failed' && (
        <div className="alert alert-danger stack" role="alert">
          <span>
            <AlertIcon />
            We couldn't load your flights. Check your connection and try again.
          </span>
          <button className="btn btn-secondary" type="button" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="alert alert-warning" role="alert">
          {missing.map((s) => (
            <p key={s.name}>
              <span className="alert-title">
                {s.status === 'timed_out'
                  ? `${s.name} did not respond within 5 seconds.`
                  : `${s.name} could not be reached.`}
              </span>
            </p>
          ))}
          Showing flights from the other sources. Try again for more options.
          <div className="alert-actions">
            <button className="btn btn-secondary btn-sm" type="button" disabled={retrying} onClick={retry}>
              {retrying && <span className="spinner" aria-hidden="true" />}
              {`Retry ${lowerFirst(missing[0].name)}`}
            </button>
          </div>
        </div>
      )}
      {shortlist?.no_service.map((mode) => (
        <p className="text-sm text-muted" role="note" key={mode}>
          {`No ${formatMode(mode).toLowerCase()} services run on this route.`}
        </p>
      ))}
      {shortlist && ordered.length > 0 && (
        <ul className="stack" role="list" aria-label="Travel options ranked, best first">
          {ordered.map((item) => (
            <FlightShortlistCard
              key={item.flight.id}
              item={item}
              tripCurrency={shortlist.currency}
              picked={legPick?.option_id === item.flight.id}
              onPick={leg && canPick ? () => pick(leg, item) : undefined}
            />
          ))}
        </ul>
      )}
      {shortlist && ordered.length === 0 && missing.length === 0 && (
        <div className="empty-state">
          <EmptyStateArt />
          <SearchIcon />
          <h2>No travel options were found for this route and date.</h2>
          <p>{`Try another date, or choose another way to travel between ${origin} and ${destination}.`}</p>
          <button className="btn btn-primary" type="button" onClick={() => navigate(tripHref)}>
            Change dates
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate(tripHref)}>
            Choose another travel mode
          </button>
        </div>
      )}
      {leg && (
        <button className="btn btn-ghost" type="button" style={{ alignSelf: 'flex-end' }} onClick={() => navigate(tripHref)}>
          Done
        </button>
      )}
      <Link to={tripHref}>Back to trip</Link>
    </div>
  )
}
