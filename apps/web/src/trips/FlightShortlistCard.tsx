import { AlertIcon, CheckIcon, StarIcon } from '../auth/icons'
import type { ShortlistFlight } from './api'
import { formatFare, formatMinutes, formatRetrieved, formatStops } from './flights'

/** One flight on the shortlist: why it is placed here, its fare, and whether it fits the trip budget. */
export function FlightShortlistCard({ item, tripCurrency }: { item: ShortlistFlight; tripCurrency: string }) {
  const { flight } = item
  return (
    <article className="card flight-option" role="listitem">
      <div className="option-top">
        <span className="provider">{flight.provider}</span>
        <span className="badge badge-neutral">{item.reason}</span>
      </div>
      <div className="fare">
        <span className="fare-amount">{formatFare(flight.fare, flight.currency)}</span>
        <span className="text-sm text-muted">{`indicative as of ${formatRetrieved(flight.fetched_at)}`}</span>
      </div>
      <div className="option-details">
        <span>{formatMinutes(flight.travel_minutes)}</span>
        <span>{formatStops(flight.stops)}</span>
        <span className="text-sm text-muted">{`via ${flight.source}`}</span>
      </div>
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
    </article>
  )
}
