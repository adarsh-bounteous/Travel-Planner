import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { AlertIcon, ArrowLeftIcon, EyeIcon, InfoIcon, SearchIcon } from '../auth/icons'
import { chooseStay, clearChosenStay, fetchStayShortlist, fetchTrip } from './api'
import type { Shortlist, Stay, Trip } from './api'
import { ChosenStayCard } from './ChosenStayCard'
import { StayComparison } from './StayComparison'
import { Toast } from './Toast'
import { StayShortlistCard } from './StayShortlistCard'
import { criteriaFromQuery, formatFetched, formatMoney, plural } from './stayOptions'
import { formatRange } from './stays'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; shortlist: Shortlist }

const LOADING_LABEL = 'Loading shortlist'

function Skeletons() {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <div className="card sk-card" key={n}>
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ))}
    </>
  )
}

/** The best stays for one Stay, budget-fitting ones first, with a side-by-side comparison. */
export function StayShortlistPage() {
  const { tripId = '', stayId = '' } = useParams()
  const [query] = useSearchParams()
  const location = useLocation()
  const criteria = useMemo(() => criteriaFromQuery(query), [query])
  const [tripName, setTripName] = useState('Trip')
  const [stay, setStay] = useState<Stay | null>(null)
  const [missing, setMissing] = useState(false)
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [comparing, setComparing] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [toast, setToast] = useState<{ key: number; message: string; undo?: () => void } | null>(null)

  const saved = (trip: Trip, message: string, undo?: () => void) => {
    setStay(trip.stays?.find((s) => s.id === stayId) ?? null)
    setToast({ key: Date.now(), message, undo })
  }

  const choose = (propertyId: string, name: string) => {
    setBusyId(propertyId)
    setSaveFailed(false)
    chooseStay(tripId, stayId, propertyId, criteria)
      .then((trip) => {
        const found = trip.stays?.find((s) => s.id === stayId)
        const dates = found ? formatRange(found.start_date, found.end_date) : 'these dates'
        saved(trip, `${name} is your chosen stay for ${dates}.`)
      })
      .catch(() => setSaveFailed(true))
      .finally(() => setBusyId(null))
  }

  const clear = () => {
    const previous = stay?.chosen
    setSaveFailed(false)
    clearChosenStay(tripId, stayId)
      .then((trip) =>
        saved(
          trip,
          'Stay cleared for these dates',
          previous ? () => choose(previous.property_id, previous.name) : undefined,
        ),
      )
      .catch(() => setSaveFailed(true))
  }

  const focusChoose = () => {
    const first = document.querySelector<HTMLButtonElement>('button[data-choose]:not(:disabled)')
    first?.scrollIntoView?.({ block: 'center' })
    first?.focus()
  }

  const load = useCallback(() => {
    setResult({ state: 'loading' })
    fetchStayShortlist(tripId, stayId, criteria)
      .then((shortlist) => setResult({ state: 'ready', shortlist }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId, stayId, criteria])

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => {
        const found = trip.stays?.find((s) => s.id === stayId)
        setTripName(trip.name)
        if (!found) return setMissing(true)
        setStay(found)
        setCanEdit(trip.can_edit ?? trip.is_owner ?? false)
        load()
      })
      .catch(() => setMissing(true))
  }, [tripId, stayId, load])

  const tripHref = `/trips/${encodeURIComponent(tripId)}`
  const optionsHref = `${tripHref}/stays/${encodeURIComponent(stayId)}/options`

  if (missing)
    return (
      <div className="alert alert-danger" role="alert">
        <span className="alert-title">We couldn't find that stay.</span> Go back to your trip and try again.{' '}
        <Link to={tripHref}>Back to trip</Link>
      </div>
    )
  if (!stay) return null

  const shortlist = result.state === 'ready' ? result.shortlist : null
  const stays = shortlist?.stays ?? []
  const within = stays.filter((s) => s.fits_budget)
  const over = stays.filter((s) => !s.fits_budget)
  const single = stays.length === 1
  const fetchedAt = stays[0]?.property.offers[0]?.fetched_at
  const note = (text: string) => (
    <p className="note">
      <InfoIcon />
      {text}
    </p>
  )

  if (comparing && shortlist && stays.length > 1)
    return (
      <div className="stack stack-lg">
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link to={tripHref}>{tripName}</Link>
            </li>
            <li>
              <Link to={`${location.pathname}${location.search}`} onClick={() => setComparing(false)}>
                Stays
              </Link>
            </li>
            <li aria-current="page">Shortlist</li>
          </ol>
        </nav>
        <h1>Compare stays</h1>
        <div className="row-between">
          <Link to={`${location.pathname}${location.search}`} onClick={() => setComparing(false)}>
            <ArrowLeftIcon /> Back to shortlist
          </Link>
          <span className="text-sm text-muted" role="status">{`Comparing ${stays.length} stays`}</span>
        </div>
        <StayComparison shortlist={shortlist} />
        {note(
          `Totals are for ${plural(shortlist.nights, 'night', 'nights')} at the lowest provider offer. Final price confirmed on provider's site.`,
        )}
      </div>
    )

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={tripHref}>{tripName}</Link>
          </li>
          <li aria-current="page">Stays</li>
        </ol>
      </nav>
      <h1>Shortlist</h1>
      <p className="text-sm text-muted">
        {`${stay.place}, ${formatRange(stay.start_date, stay.end_date)}. `}
        <Link to={tripHref}>View itinerary</Link>
      </p>
      <ChosenStayCard chosen={stay.chosen ?? null} canEdit={canEdit} onChange={focusChoose} onClear={clear} />
      {saveFailed && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't save your choice. Try again.
        </div>
      )}
      {toast && <Toast key={toast.key} message={toast.message} undo={toast.undo} />}
      {result.state === 'loading' && (
        <div className="stack" role="group" aria-label={LOADING_LABEL} aria-busy="true">
          <Skeletons />
        </div>
      )}
      {result.state === 'failed' && (
        <div className="alert alert-danger stack" role="alert">
          <span>
            <AlertIcon />
            We couldn't load your shortlist. Check your connection and try again.
          </span>
          <button className="btn btn-secondary" type="button" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {shortlist && stays.length === 0 && (
        <div className="empty-state">
          <EmptyStateArt />
          <SearchIcon />
          <h2>No stays to shortlist</h2>
          <p>No stays match your property type and rooms in {stay.place}.</p>
          <Link className="btn btn-primary" to={optionsHref}>
            Back to stay options
          </Link>
        </div>
      )}
      {shortlist && stays.length > 0 && (
        <>
          <div className="stack">
            <div className="row-between">
              <p className="text-bold" role="status">
                {single ? '1 stay on your shortlist' : `Top ${stays.length} stays, budget fits first`}
              </p>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={single}
                aria-describedby={single ? 'single-why' : undefined}
                onClick={() => setComparing(true)}
              >
                <EyeIcon />
                Compare
              </button>
            </div>
            {single && (
              <div className="alert alert-info" id="single-why">
                <span className="alert-title">Only one stay matches.</span> Comparing needs at least two stays.
                Relax your filters on the stay options to see more.
              </div>
            )}
            <p className="text-sm text-muted">
              {`${stay.place}, ${formatRange(stay.start_date, stay.end_date)} (${plural(shortlist.nights, 'night', 'nights')})`}
              {shortlist.budget !== null && shortlist.currency
                ? `, budget ${formatMoney(shortlist.budget, shortlist.currency)} for the stay`
                : ''}
              . Ranked by total price, preference fit and offers.
            </p>
          </div>
          {within.length > 0 && (
            <section className="shortlist-group" aria-labelledby="shortlist-within">
              <h3 id="shortlist-within">Within budget</h3>
              <div className="stack">
                {within.map((s) => (
                  <StayShortlistCard
                    key={s.property.id}
                    stay={s}
                    nights={shortlist.nights}
                    chosen={stay.chosen?.property_id === s.property.id}
                    busy={busyId !== null}
                    onChoose={canEdit ? () => choose(s.property.id, s.property.name) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
          {within.length > 0 && over.length > 0 && <hr className="divider" />}
          {over.length > 0 && (
            <section className="shortlist-group" aria-labelledby="shortlist-over">
              <h3 id="shortlist-over">Over budget</h3>
              <div className="stack">
                {over.map((s) => (
                  <StayShortlistCard
                    key={s.property.id}
                    stay={s}
                    nights={shortlist.nights}
                    chosen={stay.chosen?.property_id === s.property.id}
                    busy={busyId !== null}
                    onChoose={canEdit ? () => choose(s.property.id, s.property.name) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
          {single && (
            <Link to={optionsHref}>Back to stay options</Link>
          )}
          {fetchedAt &&
            note(
              `Prices fetched at ${formatFetched(fetchedAt)}, for the lowest provider offer. Final price confirmed on provider's site.`,
            )}
        </>
      )}
    </div>
  )
}
