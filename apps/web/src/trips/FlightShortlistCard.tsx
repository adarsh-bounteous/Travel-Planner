import { AlertIcon, CheckIcon, StarIcon } from '../auth/icons'
import { OptionCard } from '../components/OptionCard'
import { RouteLine } from '../components/RouteLine'
import { BookingLink } from '../travel/BookingLink'
import type { ShortlistFlight } from './api'
import { formatFare, formatMinutes, formatMode, formatRetrieved, formatStops } from './flights'

/** One flight on the shortlist: why it is placed here, its fare, and whether it fits the trip budget. */
export function FlightShortlistCard({
  item,
  tripCurrency,
  picked = false,
  onPick,
}: {
  item: ShortlistFlight
  tripCurrency: string
  /** Whether this option is the trip's pick for the leg. */
  picked?: boolean
  /** Present when the traveller can pick; the control is left out without it. */
  onPick?: () => void
}) {
  const { flight } = item
  return (
    <OptionCard
      as="li"
      picked={picked}
      title={flight.provider}
      badges={
        <>
          <span className="badge badge-neutral">{formatMode(flight.mode)}</span>
          <span className="badge badge-neutral">{item.reason}</span>
          {flight.deal && (
            <span className="badge badge-warning">
              <StarIcon />
              {`Deal: ${flight.deal}`}
            </span>
          )}
          {item.fits_budget ? (
            <span className="badge badge-success">
              <CheckIcon />
              Fits your trip budget
            </span>
          ) : (
            <span className="badge badge-danger">
              <AlertIcon />
              {`Over budget by ${formatFare(item.over_budget_by, tripCurrency)}`}
            </span>
          )}
        </>
      }
      meta={
        <>
          <span>{formatMinutes(flight.travel_minutes)}</span> <span>{formatStops(flight.stops)}</span>{' '}
          <span>{`via ${flight.source}`}</span>
        </>
      }
      price={
        <div className="fare">
          {flight.estimate && <span className="text-sm text-muted">Estimated fare</span>}
          <span className="fare-amount">{formatFare(flight.fare, flight.currency)}</span>
          {!flight.estimate && (
            <span className="text-sm text-muted">{`indicative as of ${formatRetrieved(flight.fetched_at)}`}</span>
          )}
        </div>
      }
      actions={
        <>
          {flight.mode === 'taxi' && <BookingLink url={flight.url}>Open ride provider</BookingLink>}
          {onPick && (
            <button
              className={`btn ${picked ? 'btn-primary' : 'btn-secondary'}`}
              type="button"
              aria-pressed={picked}
              onClick={onPick}
            >
              {picked && (
                <span className="check-badge is-playing">
                  <CheckIcon />
                </span>
              )}
              {picked ? 'Picked' : 'Pick'}
            </button>
          )}
        </>
      }
    >
      <RouteLine />
    </OptionCard>
  )
}
