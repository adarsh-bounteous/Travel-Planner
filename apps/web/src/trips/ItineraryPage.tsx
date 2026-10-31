import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { BrandLogo } from '../components/BrandLogo'
import { usePageName } from '../pageTitle'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BagIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  EyeIcon,
  HomeIcon,
  ImageIcon,
  InfoIcon,
  MinusIcon,
  SearchIcon,
  StarIcon,
} from '../auth/icons'
import { fetchItinerary, NotFoundError } from './api'
import type { BookingRow, EssentialFact, Itinerary, ItineraryItem, Money } from './api'
import { formatMoney, formatRate } from './money'
import { CompareTable } from '../components/CompareTable'

const MONEY_SECTIONS = [
  { id: 'bookings', label: 'Bookings and confirmations' },
  { id: 'included', label: 'Included' },
  { id: 'not-included', label: 'Not included' },
  { id: 'cost-summary', label: 'Cost summary' },
]

const SECTIONS = [
  { id: 'cover', label: 'Cover' },
  { id: 'at-a-glance', label: 'At a glance' },
  { id: 'day-by-day', label: 'Day by day' },
  { id: 'still-to-schedule', label: 'Still to schedule' },
  ...MONEY_SECTIONS,
  { id: 'essentials', label: 'Travel essentials' },
  { id: 'before-you-go', label: 'Before you go' },
  { id: 'important-notes', label: 'Important notes' },
]

const KINDS: Record<ItineraryItem['kind'], { label: string; icon: ReactNode }> = {
  stay: { label: 'Stay', icon: <HomeIcon /> },
  check_in: { label: 'Check-in', icon: <CheckIcon /> },
  check_out: { label: 'Check-out', icon: <ArrowLeftIcon /> },
  transport: { label: 'Transport', icon: <ArrowRightIcon /> },
  activity: { label: 'Activity', icon: <StarIcon /> },
  meal: { label: 'Meal', icon: <BagIcon /> },
  reminder: { label: 'Reminder', icon: <BellIcon /> },
}

const SKELETON_WIDTHS = ['40%', '70%', '55%']

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
      <p>Not yet planned</p>
    </div>
  )
}

const bookingDates = (b: BookingRow) => {
  if (!b.start_date || !b.end_date) return 'Unscheduled'
  return b.start_date === b.end_date ? formatDate(b.start_date) : formatRange(b.start_date, b.end_date)
}

function BookingsTable({ bookings }: { bookings: BookingRow[] }) {
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
        {
          key: 'link',
          header: 'Provider link',
          render: (b) =>
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
        },
      ]}
    />
  )
}

function MoneySections({ money, tripDates }: { money: Money; tripDates: Itinerary['cover'] }) {
  const { bookings, included, not_included: notIncluded, standard_exclusions: exclusions, cost } = money
  const outside = bookings.filter((b) => b.outside_trip)
  return (
    <>
      <section className="section" id="bookings" aria-labelledby="bookings-h">
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
        <h2 id="included-h">Included</h2>
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
        <h2 id="not-included-h">Not included</h2>
        <ul className="line-list">
          {notIncluded.map((n) => (
            <li key={`${n.reason}-${n.name}`}>
              <span className="name">{n.name}</span>
              {n.reason === 'unpriced' && <span className="badge badge-neutral">Unpriced</span>}
              {n.reason === 'unchosen' && n.add_path && (
                <Link to={n.add_path} aria-label={`Add to plan: ${n.name}`}>
                  Add to plan
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div>
          <h3 className="text-sm text-muted">Usually not covered by a trip plan</h3>
          <ul className="excl">
            {exclusions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <hr className="divider" />
      <section className="section" id="cost-summary" aria-labelledby="cost-h">
        <h2 id="cost-h">Cost summary</h2>
        <div className="card total">
          <span className="text-muted">Total in trip currency</span>
          <span className="total-value">{formatMoney(cost.total, cost.currency)}</span>
        </div>
        <div>
          <h3 className="text-sm text-muted">Total per currency</h3>
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

function Document({ itinerary }: { itinerary: Itinerary }) {
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
      <section className="cover" id="cover" aria-labelledby="cover-h">
        <div className="cover-art" aria-hidden="true">
          <ImageIcon />
        </div>
        <div className="cover-body">
          <h1 id="cover-h">{cover.name}</h1>
          {cover.start_date && cover.end_date && (
            <p className="cover-meta text-lg">
              <CalendarIcon />
              <span>{formatRange(cover.start_date, cover.end_date)}</span>
            </p>
          )}
          {cover.destinations.length > 0 && (
            <p className="cover-meta">
              <HomeIcon />
              <span>{cover.destinations.join(', ')}</span>
            </p>
          )}
        </div>
      </section>

      <section className="card glance" id="at-a-glance" aria-labelledby="glance-h">
        <h2 id="glance-h">At a glance</h2>
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
        <h2>Day by day</h2>
        {days.length === 0 && <NotYetPlanned />}
        {days.map((day) => (
          <article className="card day-card" key={day.date} aria-labelledby={`day-${day.number}-h`}>
            <div className="day-head">
              <h3 id={`day-${day.number}-h`}>Day {day.number}</h3>
              <span className="text-muted text-sm">{formatDay(day.date)}</span>
            </div>
            {day.items.length === 0 ? <NotYetPlanned /> : <ItemRows items={day.items} />}
          </article>
        ))}
      </div>

      <section className="card" id="still-to-schedule" aria-labelledby="still-h">
        <h2 id="still-h" className="day-head">
          Still to schedule
        </h2>
        {still.length === 0 ? <NotYetPlanned /> : <ItemRows items={still} />}
      </section>

      {itinerary.money && <MoneySections money={itinerary.money} tripDates={cover} />}

      <section id="essentials" aria-labelledby="essentials-h">
        <h2 id="essentials-h">Travel essentials</h2>
        <div className="grid">
          {essentials.map((fact) => (
            <FactCard key={fact.key} fact={fact} />
          ))}
        </div>
      </section>

      <section id="before-you-go" aria-labelledby="before-h">
        <div className="section-head">
          <h2 id="before-h">Before you go</h2>
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
        <h2 id="notes-h">Important notes</h2>
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
            <h3>Data sources and dates used</h3>
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

/** One finished, printable document for a trip, for its owner and editors. */
export function ItineraryPage() {
  const { tripId = '' } = useParams()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [error, setError] = useState<'not-found' | 'failed' | null>(null)
  const [current, setCurrent] = useState(SECTIONS[0].id)
  usePageName(itinerary?.cover.name)

  useEffect(() => {
    fetchItinerary(tripId)
      .then(setItinerary)
      .catch((e) => setError(e instanceof NotFoundError ? 'not-found' : 'failed'))
  }, [tripId])

  const goTo = (event: MouseEvent, id: string) => {
    event.preventDefault()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    setCurrent(id)
  }

  if (error === 'not-found')
    return (
      <div className="empty-state" role="alert">
        <SearchIcon />
        <h1 className="text-lg">Itinerary not found</h1>
        <p>
          This itinerary doesn't exist, or you don't have access to it. Check the link, or ask the trip's owner to
          add you as an editor.
        </p>
        <Link className="btn btn-primary" to="/">
          Go to your trips
        </Link>
      </div>
    )
  if (error)
    return (
      <div className="alert alert-danger" role="alert">
        <span className="alert-title">We couldn't load your itinerary.</span> Try again.
      </div>
    )
  if (!itinerary)
    return (
      <div className="stack" role="status" aria-label="Loading">
        {SKELETON_WIDTHS.map((width) => (
          <span key={width} className="skeleton" style={{ width }} />
        ))}
      </div>
    )

  return (
    <>
      <div className="itin-body">
        <nav className="section-list" aria-label="On this page">
          <span className="section-list-title">On this page</span>
          {SECTIONS.filter((s) => itinerary.money || !MONEY_SECTIONS.some((m) => m.id === s.id)).map((s) => (
            <a
              key={s.id}
              className="section-link"
              href={`#${s.id}`}
              aria-current={current === s.id ? 'true' : undefined}
              onClick={(e) => goTo(e, s.id)}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <Document itinerary={itinerary} />
      </div>
      <button className="btn btn-secondary print-fab" type="button" onClick={() => window.print()}>
        <EyeIcon />
        Print
      </button>
    </>
  )
}
