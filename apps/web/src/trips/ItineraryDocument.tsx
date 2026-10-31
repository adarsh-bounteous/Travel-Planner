import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BrandLogo } from '../components/BrandLogo'
import { ImageHero } from '../components/ImageHero'
import { illustrationRefOfLabel } from '../illustrations/registry'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BagIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CompassIcon,
  EyeIcon,
  HomeIcon,
  InfoIcon,
  MinusIcon,
  StarIcon,
  WalletIcon,
} from '../auth/icons'
import type { BookingRow, EssentialFact, Itinerary, ItineraryItem, Money } from './api'
import { formatMoney, formatRate } from './money'
import { CompareTable } from '../components/CompareTable'

const KINDS: Record<ItineraryItem['kind'], { label: string; icon: ReactNode }> = {
  stay: { label: 'Stay', icon: <HomeIcon /> },
  check_in: { label: 'Check-in', icon: <CheckIcon /> },
  check_out: { label: 'Check-out', icon: <ArrowLeftIcon /> },
  transport: { label: 'Transport', icon: <ArrowRightIcon /> },
  activity: { label: 'Activity', icon: <StarIcon /> },
  meal: { label: 'Meal', icon: <BagIcon /> },
  reminder: { label: 'Reminder', icon: <BellIcon /> },
}

/** An ISO calendar date read as that day in the traveller's own time zone. */
const localDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(localDate(iso))

const formatRange = (start: string, end: string) => {
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const year = new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(localDate(end))
  return `${format.format(localDate(start))} – ${format.format(localDate(end))} ${year}`
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(localDate(iso))

function FactCard({ fact }: { fact: EssentialFact }) {
  const empty = fact.value === null
  return (
    <div className="card fact" data-testid={`fact-${fact.key}`}>
      <span className="fact-label">{fact.label}</span>
      <span className={`fact-value${empty ? ' is-empty' : ''}`}>{empty ? 'Not yet planned' : fact.value}</span>
      {!empty && fact.detail && <span className="fact-detail text-sm">{fact.detail}</span>}
      {fact.link_url && (
        <a className="fact-link" href={fact.link_url} target="_blank" rel="noopener">
          {fact.link_text ?? fact.link_url}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      <span className="fact-source">
        <CalendarIcon />
        <span>
          {fact.source && fact.as_of
            ? `Source: ${fact.source}. Checked ${formatDate(fact.as_of)}.`
            : 'No source or date yet'}
        </span>
      </span>
    </div>
  )
}

function NotYetPlanned() {
  return (
    <div className="empty-state">
      <ClockIcon />
      <p>Not yet planned</p>
    </div>
  )
}

const bookingDates = (b: BookingRow) => {
  if (!b.start_date || !b.end_date) return 'Unscheduled'
  return b.start_date === b.end_date ? formatDate(b.start_date) : formatRange(b.start_date, b.end_date)
}

function BookingsTable({ bookings, readOnly }: { bookings: BookingRow[]; readOnly: boolean }) {
  const providerLink = {
    key: 'link',
    header: 'Provider link',
    render: (b: BookingRow) =>
      b.link_url ? (
        <a
          href={b.link_url}
          target="_blank"
          rel="noopener"
          aria-label={`Open ${b.provider ?? 'provider'} for ${b.name}`}
        >
          Open provider
        </a>
      ) : (
        'No link'
      ),
  }
  return (
    <CompareTable
      caption="Bookings and confirmations"
      rows={bookings}
      rowKey={(b) => `${b.kind}-${b.id}`}
      titleHeader="Item"
      title={(b) => b.name}
      badges={(b) =>
        b.outside_trip && (
          <span className="badge badge-warning">
            <AlertIcon />
            Outside trip dates
          </span>
        )
      }
      rowClassName={(b) => (b.outside_trip ? 'is-flagged' : undefined)}
      columns={[
        { key: 'provider', header: 'Provider', render: (b) => b.provider ?? '—' },
        { key: 'dates', header: 'Dates', render: bookingDates },
        {
          key: 'price',
          header: 'Price',
          render: (b) =>
            b.price !== null && b.currency ? formatMoney(b.price, b.currency) : <span className="unpriced">No price</span>,
        },
        {
          key: 'status',
          header: 'Status',
          render: () => <span className="badge badge-success">Confirmed</span>,
        },
        // The shared view carries no provider links, so it has no column for them.
        ...(readOnly ? [] : [providerLink]),
      ]}
    />
  )
}

function MoneySections({
  money,
  tripDates,
  readOnly,
}: {
  money: Money
  tripDates: Itinerary['cover']
  readOnly: boolean
}) {
  const { bookings, included, not_included: notIncluded, standard_exclusions: exclusions, cost } = money
  const outside = bookings.filter((b) => b.outside_trip)
  return (
    <>
      <section className="section" id="bookings" aria-labelledby="bookings-h">
        <h2 id="bookings-h">
          <CalendarIcon />
          Bookings and confirmations
        </h2>
        {bookings.length === 0 ? (
          <div className="empty-state">
            <BagIcon />
            <p>Nothing booked yet</p>
            {!readOnly && (
              <Link className="btn btn-primary" to="/explore">
                <CompassIcon />
                Explore options
              </Link>
            )}
          </div>
        ) : (
          <BookingsTable bookings={bookings} readOnly={readOnly} />
        )}
        {outside.length > 0 && (
          <div className="alert alert-warning" role="alert">
            <AlertIcon />
            <div>
              <p className="alert-title">A booked stay falls outside the trip dates</p>
              <p>{outside.map((b) => `${b.name} is booked ${bookingDates(b)}.`).join(' ')}</p>
              {tripDates.start_date && tripDates.end_date && (
                <p className="text-sm">
                  Trip dates: {formatRange(tripDates.start_date, tripDates.end_date)}. Change the stay with its
                  provider or adjust the trip dates.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <hr className="divider" />
      <section className="section" id="included" aria-labelledby="included-h">
        <h2 id="included-h">
          <CheckIcon />
          Included
        </h2>
        <ul className="line-list">
          {included.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <span className="name">{r.name}</span>
              <span className="amt">{formatMoney(r.price ?? 0, r.currency ?? cost.currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <hr className="divider" />
      <section className="section" id="not-included" aria-labelledby="not-included-h">
        <h2 id="not-included-h">
          <MinusIcon />
          Not included
        </h2>
        <ul className="line-list">
          {notIncluded.map((n) => (
            <li key={`${n.reason}-${n.name}`}>
              <span className="name">{n.name}</span>
              {n.reason === 'unpriced' && <span className="badge badge-neutral">Unpriced</span>}
              {!readOnly && n.reason === 'unchosen' && n.add_path && (
                <Link to={n.add_path} aria-label={`Add to plan: ${n.name}`}>
                  Add to plan
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div>
          <h3 className="text-sm text-muted">
            <InfoIcon />
            Usually not covered by a trip plan
          </h3>
          <ul className="excl">
            {exclusions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <hr className="divider" />
      <section className="section" id="cost-summary" aria-labelledby="cost-h">
        <h2 id="cost-h">
          <WalletIcon />
          Cost summary
        </h2>
        <div className="card total">
          <span className="text-muted">Total in trip currency</span>
          <span className="total-value">{formatMoney(cost.total, cost.currency)}</span>
        </div>
        <div>
          <h3 className="text-sm text-muted">
            <WalletIcon />
            Total per currency
          </h3>
          <ul className="line-list">
            {cost.by_currency.map((t) => (
              <li key={t.currency}>
                <span>{t.currency}</span>
                <span className="amt">{formatMoney(t.total, t.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
        {cost.conversions.map((c) => (
          <p className="note" key={c.currency}>
            <InfoIcon />
            <span>
              {`${c.currency} converted to ${cost.currency} at 1 ${c.currency} = ${formatRate(c.rate)} ${cost.currency}, rate from ${formatDate(c.rate_date)}.`}
            </span>
          </p>
        ))}
        <p className="note text-muted">
          <InfoIcon />
          <span>{cost.estimates_note}</span>
        </p>
      </section>
    </>
  )
}

function ItemRows({ items }: { items: ItineraryItem[] }) {
  return (
    <ul className="it-list">
      {items.map((it, i) => (
        <li className="it" key={`${it.kind}-${i}`}>
          <span className="it-icon">{KINDS[it.kind].icon}</span>
          <div>
            <div className="it-top">
              <span className="it-type">{KINDS[it.kind].label}</span>
              {it.status === 'booked' && (
                <span className="badge badge-success">
                  <CheckIcon />
                  Booked
                </span>
              )}
              {it.status === 'unbooked' && (
                <span className="badge badge-warning">
                  <AlertIcon />
                  Unbooked
                </span>
              )}
            </div>
            <div className="it-detail">
              {it.title}
              {it.detail ? `, ${it.detail}` : ''}
              {it.link_url && (
                <>
                  . <a href={it.link_url}>{it.link_text ?? it.link_url}</a>
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The complete itinerary document. `readOnly` drops everything that leads into editing or booking, for the shared page. */
export function ItineraryDocument({ itinerary, readOnly = false }: { itinerary: Itinerary; readOnly?: boolean }) {
  const { cover, glance, days, still_to_schedule: still } = itinerary
  // An older API build has none of these; treat them as empty so the page still renders.
  const essentials = itinerary.essentials ?? []
  const checklist = itinerary.checklist ?? []
  const sources = itinerary.notes?.sources ?? []
  const doneCount = checklist.filter((c) => c.done).length
  const nothingBooked = glance.booked === 0 && glance.unbooked === 0
  return (
    <div className="document">
      <div className="doc-brand">
        <BrandLogo />
      </div>
      <section className="itin-cover" id="cover" aria-labelledby="cover-h">
        <ImageHero
          variant="cover"
          illustration={illustrationRefOfLabel(cover.destinations[0])}
          title={
            <h1 id="cover-h" className="hero-title">
              {cover.name}
            </h1>
          }
          dates={cover.start_date && cover.end_date ? formatRange(cover.start_date, cover.end_date) : undefined}
        />
        {cover.destinations.length > 0 && (
          <div className="cover-body">
            <p className="cover-meta">
              <HomeIcon />
              <span>{cover.destinations.join(', ')}</span>
            </p>
          </div>
        )}
      </section>

      <section className="card glance" id="at-a-glance" aria-labelledby="glance-h">
        <h2 id="glance-h">
          <EyeIcon />
          At a glance
        </h2>
        {nothingBooked ? (
          <NotYetPlanned />
        ) : (
          <div className="cluster">
            <span className="badge badge-success">
              <CheckIcon />
              <span>Booked: {glance.booked}</span>
            </span>
            <span className="badge badge-warning">
              <AlertIcon />
              <span>Unbooked: {glance.unbooked}</span>
            </span>
          </div>
        )}
      </section>

      <div className="stack" id="day-by-day">
        <h2>
          <CalendarIcon />
          Day by day
        </h2>
        {days.length === 0 && <NotYetPlanned />}
        {days.map((day) => (
          <article className="card day-card" key={day.date} aria-labelledby={`day-${day.number}-h`}>
            <div className="day-head">
              <h3 id={`day-${day.number}-h`}>
                <CalendarIcon />
                Day {day.number}
              </h3>
              <span className="text-muted text-sm">{formatDay(day.date)}</span>
            </div>
            {day.items.length === 0 ? <NotYetPlanned /> : <ItemRows items={day.items} />}
          </article>
        ))}
      </div>

      <section className="card" id="still-to-schedule" aria-labelledby="still-h">
        <h2 id="still-h" className="day-head">
          <ClockIcon />
          Still to schedule
        </h2>
        {still.length === 0 ? <NotYetPlanned /> : <ItemRows items={still} />}
      </section>

      {itinerary.money && <MoneySections money={itinerary.money} tripDates={cover} readOnly={readOnly} />}

      <section id="essentials" aria-labelledby="essentials-h">
        <h2 id="essentials-h">
          <BagIcon />
          Travel essentials
        </h2>
        <div className="grid">
          {essentials.map((fact) => (
            <FactCard key={fact.key} fact={fact} />
          ))}
        </div>
      </section>

      <section id="before-you-go" aria-labelledby="before-h">
        <div className="section-head">
          <h2 id="before-h">
            <CheckIcon />
            Before you go
          </h2>
          <span className="text-muted text-sm" role="status" aria-label={`${doneCount} of 6 done`}>
            {doneCount} of 6 done
          </span>
        </div>
        <ul className="check-list" aria-label="Before you go">
          {checklist.map((c) => (
            <li className={`check-row${c.done ? ' is-done' : ''}`} key={c.key} data-testid={`check-${c.key}`}>
              <span className="check-label">
                {c.label}
                {c.hint && <span className="text-muted text-sm check-hint">{c.hint}</span>}
              </span>
              {c.done ? (
                <span className="badge badge-success">
                  <CheckIcon />
                  Done
                </span>
              ) : (
                <span className="badge badge-neutral">
                  <MinusIcon />
                  Not done
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section id="important-notes" aria-labelledby="notes-h">
        <h2 id="notes-h">
          <AlertIcon />
          Important notes
        </h2>
        <div className="stack">
          <div className="alert alert-warning">
            <AlertIcon />
            <p>
              <span className="alert-title">Prices and availability may change.</span> Check again before you book.
            </p>
          </div>
          <div className="alert alert-info">
            <InfoIcon />
            <p>
              <span className="alert-title">Confirm with official sources before you travel.</span> Entry rules and
              health advice can change at short notice.
            </p>
          </div>
          <div className="card">
            <h3>
              <InfoIcon />
              Data sources and dates used
            </h3>
            <ul className="sources text-sm">
              {sources.map((s) => (
                <li key={s.label}>
                  {s.label}: {s.source}, {formatDate(s.as_of)}
                </li>
              ))}
              {sources.length < essentials.length && <li>Items marked Not yet planned have no source yet.</li>}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
