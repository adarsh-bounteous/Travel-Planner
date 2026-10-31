import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { usePageName } from '../pageTitle'
import { useAuth } from '../auth/AuthProvider'
import { ArrowLeftIcon, SearchIcon, SuitcaseIcon } from '../auth/icons'
import { fetchItinerary, NotFoundError } from './api'
import type { Itinerary } from './api'
import { ItineraryActions } from './ItineraryActions'
import { ItineraryDocument } from './ItineraryDocument'

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

const SKELETON_WIDTHS = ['40%', '70%', '55%']

/** One finished, printable document for a trip, for its owner and editors. */
export function ItineraryPage() {
  const { tripId = '' } = useParams()
  const { email } = useAuth()
  const [params] = useSearchParams()
  const printOnLoad = params.get('print') === '1'
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [error, setError] = useState<'not-found' | 'failed' | null>(null)
  const [current, setCurrent] = useState(SECTIONS[0].id)
  usePageName(itinerary?.cover.name)

  useEffect(() => {
    fetchItinerary(tripId)
      .then(setItinerary)
      .catch((e) => setError(e instanceof NotFoundError ? 'not-found' : 'failed'))
  }, [tripId])

  // "Print or Save as PDF" from the trip page lands here with ?print=1: open the print dialog once the document is on screen.
  const loaded = itinerary !== null
  useEffect(() => {
    if (loaded && printOnLoad) window.print()
  }, [loaded, printOnLoad])

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
          <SuitcaseIcon />
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
      <Link className="itin-back" to={`/trips/${encodeURIComponent(tripId)}`}>
        <ArrowLeftIcon />
        Back to trip
      </Link>
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
        <ItineraryDocument itinerary={itinerary} />
      </div>
      <div className="itin-foot">
        <ItineraryActions tripId={tripId} email={email ?? ''} showView={false} onPrint={() => window.print()} />
      </div>
    </>
  )
}
