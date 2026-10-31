import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon, EditIcon, EyeIcon, PlaneIcon, PlusIcon, XIcon } from '../auth/icons'
import { BookingLink } from '../travel/BookingLink'
import { clearTransport, refreshTransport } from './api'
import type { TransportLeg, TransportPick, Trip } from './api'
import { formatFare, legName, LEGS, pickSummary } from './flights'
import { Toast } from './Toast'
import { formatMoney } from './TripTotalCard'

type TransportTabProps = {
  trip: Trip
  /** Called with the trip after a pick is cleared or a fare is refreshed, so the page shows the new total. */
  onChanged: (trip: Trip) => void
  onViewItinerary: () => void
}

const fareChanged = (pick: TransportPick) => Number(pick.fare) !== Number(pick.picked_fare)

/** Where a leg's shortlist looks: the pick's own route when there is one, else a route from the trip. */
function shortlistHref(trip: Trip, leg: TransportLeg, pick?: TransportPick) {
  const destination = trip.destination ?? ''
  const date = trip.start_date ?? ''
  const route = pick
    ? { origin: pick.origin, destination: pick.destination, date: pick.date }
    : leg === 'destination'
      ? { origin: 'Home', destination, date }
      : leg === 'between_cities'
        ? { origin: destination, destination: trip.stays?.[1]?.place ?? destination, date }
        : { origin: 'Airport', destination, date }
  return `/trips/${encodeURIComponent(trip.id)}/flights?${new URLSearchParams({ ...route, leg })}`
}

/** One card per leg of the journey, each holding its pick with the provider's booking link, and the trip total. */
export function TransportTab({ trip: initial, onChanged, onViewItinerary }: TransportTabProps) {
  const [trip, setTrip] = useState(initial)
  const [failed, setFailed] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const editable = trip.can_edit ?? trip.is_owner ?? false
  const picks = trip.transport ?? []
  const destination = trip.destination ?? 'your destination'

  useEffect(() => {
    // Fares may have moved since the pick; the server re-reads them and keeps the pick.
    refreshTransport(initial.id).then(
      (updated) => {
        setTrip(updated)
        onChanged(updated)
      },
      () => {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id])

  const clear = async (pick: TransportPick) => {
    setFailed(false)
    try {
      const updated = await clearTransport(trip.id, pick.leg)
      setTrip(updated)
      onChanged(updated)
      setToast({ id: Date.now(), message: `Cleared ${pick.provider}. It is no longer in your trip total.` })
    } catch {
      setFailed(true)
    }
  }

  const changed = picks.filter(fareChanged)
  const hasEstimate = picks.some((p) => p.estimate)

  return (
    <section className="stack" aria-labelledby="transport-heading">
      <h2 id="transport-heading">
        <PlaneIcon />
        Transport
      </h2>
      {changed.map((p) => (
        <div className="alert alert-warning" role="status" key={p.leg}>
          <span className="alert-title">A fare changed after you picked it.</span>
          {` ${p.provider} now costs ${formatFare(p.fare, p.currency)}, up from ${formatFare(p.picked_fare, p.currency)}. Your trip total uses the new fare.`}
        </div>
      ))}
      {failed && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't clear that pick. Check your connection and try again.
        </div>
      )}
      <div className="stack">
        {LEGS.map((leg) => {
          const pick = picks.find((p) => p.leg === leg)
          return (
            <div className="card stack" key={leg}>
              <h3>
                <PlaneIcon />
                {legName(leg, destination)}
              </h3>
              {pick ? (
                <div className="card leg-pick">
                  <div className="pick-head">
                    <span className="text-bold">{pickSummary(pick)}</span>
                    {fareChanged(pick) && (
                      <span className="badge badge-warning">{`Fare updated, was ${formatFare(pick.picked_fare, pick.currency)}`}</span>
                    )}
                  </div>
                  <div className="link-row">
                    <BookingLink url={pick.url}>
                      Book with provider
                      <span className="sr-only"> (opens in a new tab)</span>
                    </BookingLink>
                    <span className="text-sm text-muted">Fare may differ on the provider's booking page.</span>
                  </div>
                  {editable && (
                    <div className="cluster">
                      <Link className="btn btn-secondary" to={shortlistHref(trip, leg, pick)}>
                        <EditIcon />
                        Change
                      </Link>
                      <button className="btn btn-ghost" type="button" onClick={() => clear(pick)}>
                        <XIcon />
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="empty-state">
                    <PlaneIcon />
                    No transport picked yet
                  </div>
                  {editable && (
                    <Link className="btn btn-secondary" to={shortlistHref(trip, leg)}>
                      <PlusIcon />
                      Choose transport
                    </Link>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="cluster">
        <span className="text-bold">Trip total</span>
        <span className="badge badge-neutral" aria-live="polite">
          {trip.cost ? formatMoney(trip.cost.total, trip.cost.currency) : ''}
        </span>
      </div>
      <p className="text-sm text-muted">
        {picks.length > 0
          ? `Adds up ${picks.length} ${picks.length === 1 ? 'pick' : 'picks'}${hasEstimate ? ', including taxi estimates' : ''}. You pay providers when you book with them.`
          : 'No picks yet, so nothing is added to your trip.'}
      </p>
      <button className="btn btn-primary" type="button" style={{ alignSelf: 'flex-start' }} onClick={onViewItinerary}>
        <EyeIcon />
        View itinerary
      </button>
      {toast && <Toast key={toast.id} message={toast.message} />}
    </section>
  )
}
