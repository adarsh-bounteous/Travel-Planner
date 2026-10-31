import { Link } from 'react-router'
import { AlertIcon, InfoIcon } from '../auth/icons'
import { CompareTable } from '../components/CompareTable'
import type { Booking, ItineraryMoney as Money } from './api'
import { formatDay, formatFullDate, formatMoney, formatRange, formatRate } from './itineraryFormat'

type TripDates = { start: string | null; end: string | null }

const bookingDates = (b: Booking) => {
  if (!b.start_date || !b.end_date) return 'Unscheduled'
  return b.start_date === b.end_date ? formatFullDate(b.start_date) : formatRange(b.start_date, b.end_date)
}

function BookingsTable({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="bk-wrap">
      <CompareTable
        caption="Bookings and confirmations"
        rows={bookings}
        rowKey={(b) => `${b.kind}-${b.name}-${b.start_date}`}
        titleHeader="Item"
        title={(b) => b.name}
        badges={(b) =>
          b.outside_trip_dates && (
            <span className="badge badge-warning">
              <AlertIcon />
              Outside trip dates
            </span>
          )
        }
        rowClassName={(b) => (b.outside_trip_dates ? 'is-flagged' : undefined)}
        columns={[
          { key: 'provider', header: 'Provider', render: (b) => b.provider ?? '—' },
          { key: 'dates', header: 'Dates', render: bookingDates },
          {
            key: 'price',
            header: 'Price',
            render: (b) =>
              b.price && b.currency ? formatMoney(b.price, b.currency) : <span className="unpriced">No price</span>,
          },
          { key: 'status', header: 'Status', render: (b) => <span className="badge badge-neutral">{b.status}</span> },
          {
            key: 'link',
            header: 'Provider link',
            render: (b) =>
              b.link_url ? (
                <a href={b.link_url} aria-label={`Open ${b.provider ?? 'provider'} for ${b.name}`}>
                  Open provider
                </a>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </div>
  )
}

function OutsideDatesAlert({ stays, tripDates }: { stays: Booking[]; tripDates: TripDates }) {
  return (
    <div className="alert alert-warning" role="alert">
      <p className="alert-title">
        <AlertIcon /> A booked stay falls outside the trip dates
      </p>
      <p>{stays.map((s) => `${s.name} is booked ${bookingDates(s)}.`).join(' ')}</p>
      {tripDates.start && tripDates.end && (
        <p className="text-sm">
          Trip dates: {formatDay(tripDates.start)} – {formatDay(tripDates.end)}. Change the stay with its provider or
          adjust the trip dates.
        </p>
      )}
    </div>
  )
}

/** What the plan books, includes and leaves out, and what it costs. Built by the server; formatted here. */
export function ItineraryMoney({ money, tripDates }: { money: Money; tripDates: TripDates }) {
  const { bookings, included, not_included: notIncluded, standard_exclusions: exclusions, cost } = money
  const outside = bookings.filter((b) => b.outside_trip_dates)
  return (
    <>
      <hr className="divider" />
      <section className="section" id="bookings-section" aria-labelledby="bookings-h">
        <h2 id="bookings-h">Bookings and confirmations</h2>
        {bookings.length === 0 ? (
          <div className="empty-state">
            <p>Nothing booked yet</p>
            <Link className="btn btn-primary" to="/explore">
              Explore options
            </Link>
          </div>
        ) : (
          <BookingsTable bookings={bookings} />
        )}
        {outside.length > 0 && <OutsideDatesAlert stays={outside} tripDates={tripDates} />}
      </section>

      <hr className="divider" />
      <section className="section" id="included-section" aria-labelledby="included-h">
        <h2 id="included-h">Included</h2>
        {included.length === 0 ? (
          <p className="text-muted">Nothing priced is included yet.</p>
        ) : (
          <ul className="line-list">
            {included.map((line, i) => (
              <li key={`${line.name}-${i}`}>
                <span className="name">{line.name}</span>
                <span className="amt">{formatMoney(line.amount, line.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="divider" />
      <section className="section" id="not-included-section" aria-labelledby="not-included-h">
        <h2 id="not-included-h">Not included</h2>
        {notIncluded.length > 0 && (
          <ul className="line-list">
            {notIncluded.map((line) => (
              <li key={`${line.reason}-${line.name}`}>
                <span className="name">
                  {line.name}
                  {line.reason === 'unpriced' && <> <span className="badge badge-neutral">Unpriced</span></>}
                </span>
                {line.reason === 'unchosen' ? (
                  <Link to={line.add_url} aria-label={`Add to plan: ${line.name}`}>
                    Add to plan
                  </Link>
                ) : (
                  <Link to={line.add_url} aria-label={`Add price for ${line.name}`}>
                    Add price
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div>
          <h3 id="exclusions-h" className="text-sm text-muted">
            Usually not covered by a trip plan
          </h3>
          <ul className="excl" aria-labelledby="exclusions-h">
            {exclusions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <hr className="divider" />
      <section className="section" id="cost-summary-section" aria-labelledby="cost-h">
        <h2 id="cost-h">Cost summary</h2>
        <div className="card total">
          <span className="text-muted">Total in trip currency</span>
          <span className="total-value">{formatMoney(cost.total, cost.currency)}</span>
        </div>
        <div>
          <h3 className="text-sm text-muted">Total per currency</h3>
          <ul className="line-list">
            {cost.subtotals.map((s) => (
              <li key={s.currency}>
                <span>{s.currency}</span>
                <span className="amt">{formatMoney(s.amount, s.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
        {cost.conversions.length > 0 && (
          <p className="note">
            <InfoIcon />
            <span>
              {cost.conversions
                .map(
                  (c) =>
                    `${c.currency} converted to ${cost.currency} at 1 ${c.currency} = ${formatRate(c.rate)} ${cost.currency}, rate from ${formatFullDate(c.rate_date)}.`,
                )
                .join(' ')}
            </span>
          </p>
        )}
        <p className="note text-muted">
          <InfoIcon />
          <span>{cost.estimates_note}</span>
        </p>
      </section>
    </>
  )
}
