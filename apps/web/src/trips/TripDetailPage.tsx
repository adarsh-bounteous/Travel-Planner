import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EditIcon } from '../auth/icons'
import { NotFoundError, fetchTrip } from './api'
import type { Day, Trip } from './api'
import { BookTripDrawer } from './BookTripDrawer'
import { DeleteTripModal } from './DeleteTripModal'
import { ItineraryTab } from './ItineraryTab'
import { RenameDayModal } from './RenameDayModal'
import { Toast } from './Toast'
import { TripSettingsDrawer } from './TripSettingsDrawer'

type LoadState = 'loading' | 'ready' | 'notFound' | 'failed'
type Tab = 'overview' | 'itinerary'
type Panel =
  | { id: 'none' }
  | { id: 'settings' }
  | { id: 'delete' }
  | { id: 'book' }
  | { id: 'rename'; day: Day; position: number }

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
]

function formatBudget(trip: Trip) {
  if (trip.budget == null) return 'No budget set'
  const amount = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(trip.budget)
  return `Budget ${amount} ${trip.currency ?? 'EUR'}`
}

/** A trip day by day. Only the owner sees the controls that change it. */
export function TripDetailPage({ tripId }: { tripId: string }) {
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [load, setLoad] = useState<LoadState>('loading')
  const [tab, setTab] = useState<Tab>('itinerary')
  const [panel, setPanel] = useState<Panel>({ id: 'none' })
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchTrip(tripId).then(
      (loaded) => {
        setTrip(loaded)
        setLoad('ready')
      },
      (reason) => setLoad(reason instanceof NotFoundError ? 'notFound' : 'failed'),
    )
  }, [tripId])

  if (load === 'loading')
    return (
      <div className="stack" role="status" aria-label="Loading">
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    )
  if (load === 'notFound')
    return (
      <div className="stack">
        <h1>Trip not found</h1>
        <p>
          We couldn't find that trip. <Link to="/">Back to your trips</Link>
        </p>
      </div>
    )
  if (load === 'failed' || trip === null)
    return <p role="alert">We couldn't load this trip. Reload to try again.</p>

  const options = trip.options ?? []
  const close = () => setPanel({ id: 'none' })
  const saved = (updated: Trip, message: string) => {
    setTrip(updated)
    setToast({ id: Date.now(), message })
    close()
  }

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/">Trips</Link>
          </li>
          <li aria-current="page">{trip.name}</li>
        </ol>
      </nav>
      <div className="stack stack-sm">
        <div className="title-row">
          <h1>{trip.name}</h1>
          <div className="title-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={options.length === 0}
              aria-describedby={options.length === 0 ? 'book-hint' : undefined}
              onClick={() => setPanel({ id: 'book' })}
            >
              Book trip
            </button>
            {options.length === 0 && (
              <span className="text-sm text-muted" id="book-hint">
                Choose an option to enable booking.
              </span>
            )}
          </div>
          {trip.is_owner && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setPanel({ id: 'settings' })}
            >
              <EditIcon />
              Edit trip
            </button>
          )}
        </div>
        <p className="text-muted">{formatBudget(trip)}</p>
      </div>
      <div className="tabs" role="tablist" aria-label="Trip sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className="tab"
            role="tab"
            type="button"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'itinerary' ? (
          <ItineraryTab
            trip={trip}
            onRename={(day, index) => setPanel({ id: 'rename', day, position: index + 1 })}
          />
        ) : (
          <p className="text-muted">Trip overview is shown on its own page.</p>
        )}
      </div>
      {trip.is_owner && (panel.id === 'settings' || panel.id === 'delete') && (
        <TripSettingsDrawer
          trip={trip}
          covered={panel.id === 'delete'}
          onClose={close}
          onSaved={(updated) => saved(updated, 'Trip saved')}
          onDelete={() => setPanel({ id: 'delete' })}
        />
      )}
      {trip.is_owner && panel.id === 'delete' && (
        <DeleteTripModal
          trip={trip}
          onCancel={() => setPanel({ id: 'settings' })}
          onDeleted={() => navigate('/', { state: { toast: 'Trip deleted' } })}
        />
      )}
      {trip.is_owner && panel.id === 'rename' && (
        <RenameDayModal
          tripId={trip.id}
          day={panel.day}
          position={panel.position}
          onClose={close}
          onRenamed={(updated, name) => saved(updated, `Day renamed to ${name}`)}
        />
      )}
      {panel.id === 'book' && <BookTripDrawer options={options} onClose={close} />}
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </div>
  )
}
