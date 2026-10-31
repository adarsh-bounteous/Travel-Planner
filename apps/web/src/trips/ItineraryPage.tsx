import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router'
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
  SearchIcon,
  StarIcon,
} from '../auth/icons'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { HeroImage } from '../components/HeroImage'
import { fetchItinerary, NotFoundError } from './api'
import type { Itinerary, ItineraryItem } from './api'

const SECTIONS = [
  { id: 'cover', label: 'Cover' },
  { id: 'at-a-glance', label: 'At a glance' },
  { id: 'day-by-day', label: 'Day by day' },
  { id: 'still-to-schedule', label: 'Still to schedule' },
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

function NotYetPlanned() {
  return (
    <div className="empty-state">
      <EmptyStateArt />
      <p>Not yet planned</p>
    </div>
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
  const nothingBooked = glance.booked === 0 && glance.unbooked === 0
  return (
    <div className="document">
      <section className="itin-cover" id="cover" aria-labelledby="cover-h">
        <HeroImage
          illustration={{ destination: cover.destinations[0]?.split(',')[0] }}
          alt={cover.destinations[0] ? `Illustration of ${cover.destinations[0]}` : 'Travel illustration'}
        >
          <h1 className="hero-title" id="cover-h">
            {cover.name}
          </h1>
          {cover.start_date && cover.end_date && (
            <p className="hero-dates">
              <CalendarIcon />
              <span>{formatRange(cover.start_date, cover.end_date)}</span>
            </p>
          )}
        </HeroImage>
        <div className="cover-body">
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
    </div>
  )
}

/** One finished, printable document for a trip, for its owner and editors. */
export function ItineraryPage() {
  const { tripId = '' } = useParams()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [error, setError] = useState<'not-found' | 'failed' | null>(null)
  const [current, setCurrent] = useState(SECTIONS[0].id)

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
        <EmptyStateArt />
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
          {SECTIONS.map((s) => (
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
