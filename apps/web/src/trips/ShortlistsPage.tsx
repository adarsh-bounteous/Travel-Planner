import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useLocation, useParams } from 'react-router'
import { fetchTrip } from './api'
import type { Trip } from './api'
import { Toast } from './Toast'

const TABS = [
  { id: 'places', label: 'Places', heading: 'Places to consider', empty: 'Shortlisted places' },
  { id: 'stays', label: 'Stays', heading: 'Stays to consider', empty: 'Shortlisted stays' },
  {
    id: 'activities',
    label: 'Activities',
    heading: 'Activities to consider',
    empty: 'Shortlisted activities',
  },
] as const

type TabId = (typeof TABS)[number]['id']
type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; trip: Trip }

const plural = (n: number) => (n === 1 ? '1 traveller' : `${n} travellers`)

/** Where New trip set-up lands. The shortlists themselves are built elsewhere; this is the landing shell. */
export function ShortlistsPage() {
  const { tripId = '' } = useParams()
  const state = useLocation().state as { toast?: string; placeFailed?: boolean } | null
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<TabId>('places')

  useEffect(() => {
    let current = true
    fetchTrip(tripId).then(
      (trip) => current && setLoad({ status: 'loaded', trip }),
      () => current && setLoad({ status: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [tripId, attempt])

  const retry = () => {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + step + TABS.length) % TABS.length]
    setTab(next.id)
    document.getElementById(`shortlist-tab-${next.id}`)?.focus()
  }

  if (load.status === 'loading')
    return (
      <div className="stack" role="status" aria-label="Loading">
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    )
  if (load.status === 'failed')
    return (
      <div className="alert alert-danger" role="alert">
        <p className="alert-title">We couldn't load your trip.</p>
        <p>Check your connection and try again.</p>
        <div>
          <button className="btn btn-secondary" type="button" onClick={retry}>
            Retry
          </button>
        </div>
      </div>
    )

  const { trip } = load
  const currency = trip.currency ?? 'EUR'
  const budget =
    trip.budget == null
      ? ''
      : `, budget ${new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(trip.budget)}`
  const travellers = trip.traveller_count ? `, ${plural(trip.traveller_count)}` : ''
  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <h1>Shortlists</h1>
        <p className="text-muted">
          {trip.name} is ready: {trip.destination}
          {travellers}
          {budget}. Trip currency: {currency}.
        </p>
      </div>
      {state?.placeFailed && (
        <p role="alert" className="alert alert-danger">
          We couldn't add that place. Try again.
        </p>
      )}
      <div className="tabs" role="tablist" aria-label="Shortlists" onKeyDown={onKeyDown}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className="tab"
            role="tab"
            type="button"
            id={`shortlist-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="shortlist-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="shortlist-box">
        <div role="tabpanel" id="shortlist-panel" aria-labelledby={`shortlist-tab-${tab}`}>
          <h2>{active.heading}</h2>
          <p className="text-muted">{active.empty} for this trip will appear here.</p>
        </div>
      </div>
      <Toast message={state?.toast ?? null} />
    </div>
  )
}
