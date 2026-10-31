import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRightIcon, BellIcon, EditIcon, EyeIcon } from '../auth/icons'
import { ImageHero } from '../components/ImageHero'
import { illustrationRefOfTrip } from '../illustrations/registry'
import { NotFoundError, TRIP_WRITE_REFUSED, addReminder, fetchTrip, moveActivity } from './api'
import type { Activity, Day, Reminder, RestaurantPick, Stay, Trip } from './api'
import { AccessRemovedModal } from './AccessRemovedModal'
import { AddActivityDrawer } from './AddActivityDrawer'
import { BookTripDrawer } from './BookTripDrawer'
import { InsurancePickClearedModal } from './InsurancePickClearedModal'
import { DeleteTripModal } from './DeleteTripModal'
import { ItineraryTab } from './ItineraryTab'
import { PanelFade } from './PanelFade'
import { useTabIndicator } from './useTabIndicator'
import { ReminderModal } from './ReminderModal'
import { RemoveActivityModal } from './RemoveActivityModal'
import { RenameDayModal } from './RenameDayModal'
import { RestaurantPickDialog } from './RestaurantPickDialog'
import { RemoveStayModal } from './RemoveStayModal'
import { ShareTripModal } from './ShareTripModal'
import { StayDrawer } from './StayDrawer'
import { StaysReviewDrawer } from './StaysReviewDrawer'
import { RestaurantsCard } from './RestaurantsCard'
import { StaysSection } from './StaysSection'
import { formatRange } from './stays'
import { Toast } from './Toast'
import { TransportTab } from './TransportTab'
import { TravelersTab } from './TravelersTab'
import { TravelHelpersCard } from './TravelHelpersCard'
import { TripSettingsDrawer } from './TripSettingsDrawer'
import { TripRecommendationsTab } from './TripRecommendationsTab'
import { UnmatchedBadge } from './UnmatchedBadge'
import { TripTotalCard } from './TripTotalCard'
import { VisaSummaryCard } from './VisaSummaryCard'

type LoadState = 'loading' | 'ready' | 'notFound' | 'failed'
type Tab = 'overview' | 'itinerary' | 'stays' | 'transport' | 'travelers' | 'recommendations'
type Panel =
  | { id: 'none' }
  | { id: 'settings' }
  | { id: 'delete' }
  | { id: 'stays-review' }
  | { id: 'book' }
  | { id: 'share' }
  | { id: 'rename'; day: Day; position: number }
  | { id: 'reminder-add'; optionId?: string }
  | { id: 'reminder-edit'; reminder: Reminder }
  | { id: 'add-activity'; day: Day }
  | { id: 'remove-activity'; activity: Activity }
  | { id: 'move-restaurant'; pick: RestaurantPick }
  | { id: 'add-stay' }
  | { id: 'edit-stay'; stay: Stay }
  | { id: 'remove-stay'; stay: Stay }

const REFRESH_MS = 30_000

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'stays', label: 'Stays' },
  { id: 'transport', label: 'Transport' },
  { id: 'travelers', label: 'Travelers' },
  { id: 'recommendations', label: 'Recommendations' },
]

/** A trip day by day. Only the owner sees the controls that change it. */
const savedMessage = (before: Trip, after: Trip) => {
  if (!before.destination_unmatched) return 'Trip saved'
  return after.destination_unmatched
    ? 'Destination saved. Still unmatched.'
    : 'Destination saved. Unmatched flag removed.'
}

export function TripDetailPage({ tripId }: { tripId: string }) {
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [load, setLoad] = useState<LoadState>('loading')
  const [tab, setTab] = useState<Tab>('itinerary')
  const [accessRemoved, setAccessRemoved] = useState(false)
  const [insuranceCleared, setInsuranceCleared] = useState(false)
  const [panel, setPanel] = useState<Panel>({ id: 'none' })
  const [toast, setToast] = useState<{ id: number; message: string; undo?: () => void } | null>(
    null,
  )

  const tablistRef = useRef<HTMLDivElement>(null)
  const indicator = useTabIndicator(tablistRef, trip ? tab : '')

  useEffect(() => {
    fetchTrip(tripId).then(
      (loaded) => {
        setTrip(loaded)
        setLoad('ready')
      },
      (reason) => setLoad(reason instanceof NotFoundError ? 'notFound' : 'failed'),
    )
  }, [tripId])

  // The open trip is re-fetched on focus and every 30 s, so a changed price shows its new total
  // and warning without a reload. An editor's access can also be revoked meanwhile: a 404 tells
  // them, and so does any refused change. The server refuses the change itself.
  const loaded = trip !== null
  const isEditor = trip?.is_owner === false
  useEffect(() => {
    if (!loaded) return
    const recheck = () =>
      fetchTrip(tripId).then(setTrip, (reason) => {
        if (isEditor && reason instanceof NotFoundError) setAccessRemoved(true)
      })
    const timer = setInterval(recheck, REFRESH_MS)
    window.addEventListener('focus', recheck)
    if (isEditor) window.addEventListener(TRIP_WRITE_REFUSED, recheck)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', recheck)
      window.removeEventListener(TRIP_WRITE_REFUSED, recheck)
    }
  }, [loaded, isEditor, tripId])

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
  const bookable =
    options.length > 0 ||
    Boolean(trip.sim) ||
    Boolean(trip.insurance) ||
    (trip.stays ?? []).some((s) => s.chosen) ||
    (trip.transport ?? []).length > 0
  const close = () => setPanel({ id: 'none' })
  /** Opens the "pick cleared" dialog when a user's own change removed the insurance pick. */
  const track = (updated: Trip) => {
    if (trip.insurance && !updated.insurance) setInsuranceCleared(true)
    setTrip(updated)
  }
  const saved = (updated: Trip, message: string) => {
    track(updated)
    setToast({ id: Date.now(), message })
    close()
  }
  const canEdit = trip.can_edit ?? trip.is_owner ?? false
  const dayName = (date: string) => trip.days?.find((d) => d.date === date)?.name ?? date
  const move = async (activity: Activity, date: string) => {
    const updated = await moveActivity(trip.id, activity.id, date)
    saved(updated, `${activity.name} moved to ${dayName(date)}.`)
  }
  const reminderDeleted = (updated: Trip, reminder: Reminder) => {
    const undo = async () => {
      try {
        const { text, date, option_id } = reminder
        setTrip(await addReminder(trip.id, { text, date, option_id: option_id ?? null }))
        setToast(null)
      } catch {
        setToast({ id: Date.now(), message: "We couldn't bring that reminder back. Add it again." })
      }
    }
    setTrip(updated)
    setToast({ id: Date.now(), message: 'Reminder deleted.', undo })
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
      <header className="trip-hero" aria-label="Trip">
        <ImageHero
          illustration={illustrationRefOfTrip(trip)}
          title={<h1 className="hero-title">{trip.name}</h1>}
          dates={trip.start_date && trip.end_date ? formatRange(trip.start_date, trip.end_date) : undefined}
        />
        {trip.destination && <p>{trip.destination}</p>}
      </header>
      <div className="stack stack-sm">
        <div className="title-row">
          {trip.destination_unmatched && <UnmatchedBadge />}
          <div className="title-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!bookable}
              aria-describedby={bookable ? undefined : 'book-hint'}
              onClick={() => setPanel({ id: 'book' })}
            >
              Book trip
            </button>
            {!bookable && (
              <span className="text-sm text-muted" id="book-hint">
                Choose an option to enable booking.
              </span>
            )}
          </div>
          <Link className="btn btn-secondary" to={`/trips/${encodeURIComponent(trip.id)}/sim-options`}>
            SIM options
            <ArrowRightIcon />
          </Link>
          {canEdit && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setPanel({ id: 'reminder-add' })}
            >
              <BellIcon />
              Add reminder
            </button>
          )}
          {trip.is_owner && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setPanel({ id: 'share' })}
            >
              <EyeIcon />
              Share trip
            </button>
          )}
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
        <p className="text-sm text-muted">
          Reminders show on their date and stay in the app. We don't send email or push messages.
        </p>
      </div>
      <div className="tabs trip-tabs" role="tablist" aria-label="Trip sections" ref={tablistRef}>
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
        <span
          className={indicator.moving ? 'tab-indicator is-moving' : 'tab-indicator'}
          aria-hidden="true"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </div>
      <div className="trip-layout">
      <div className="trip-main">
      <div className="insurance-row card">
        <p aria-live="polite">
          {trip.insurance ? `Insurance: ${trip.insurance.name} picked` : 'Insurance: not yet picked'}
        </p>
        {canEdit && (
          <Link
            className="btn btn-secondary"
            to={`/trips/${encodeURIComponent(trip.id)}/insurance-options`}
          >
            Insurance options
          </Link>
        )}
      </div>
      {trip.is_owner && <VisaSummaryCard tripId={trip.id} unresolved={trip.unresolved_visas ?? []} />}
      <PanelFade tabKey={tab}>
        {tab === 'itinerary' ? (
          <ItineraryTab
            trip={trip}
            onRename={(day, index) => setPanel({ id: 'rename', day, position: index + 1 })}
            onAddReminder={(optionId) => setPanel({ id: 'reminder-add', optionId })}
            onEditReminder={(reminder) => setPanel({ id: 'reminder-edit', reminder })}
            onAddActivity={(day) => setPanel({ id: 'add-activity', day })}
            onMoveActivity={move}
            onRemoveActivity={(activity) => setPanel({ id: 'remove-activity', activity })}
            onMoveRestaurant={(pick) =>
              (trip.days ?? []).length === 0
                ? setToast({ id: Date.now(), message: 'Add trip dates first, then you can give this pick a day.' })
                : setPanel({ id: 'move-restaurant', pick })
            }
          />
        ) : tab === 'stays' ? (
          <StaysSection
            tripId={tripId}
            stays={trip.stays ?? []}
            tripStart={trip.start_date}
            tripEnd={trip.end_date}
            canEdit={canEdit}
            onAdd={() => setPanel({ id: 'add-stay' })}
            onEdit={(stay) => setPanel({ id: 'edit-stay', stay })}
            onRemove={(stay) => setPanel({ id: 'remove-stay', stay })}
          />
        ) : tab === 'transport' ? (
          <TransportTab trip={trip} onChanged={setTrip} onViewItinerary={() => setTab('itinerary')} />
        ) : tab === 'recommendations' ? (
          <TripRecommendationsTab
            tripId={tripId}
            interests={trip.interests ?? []}
            onBack={() => setTab('itinerary')}
          />
        ) : tab === 'travelers' ? (
          <TravelersTab
            trip={trip}
            onChanged={(updated, message, undo) => {
              track(updated)
              setToast({ id: Date.now(), message, undo })
            }}
          />
        ) : (
          <div className="stack">
            <RestaurantsCard trip={trip} canEdit={canEdit} />
            <TravelHelpersCard trip={trip} />
          </div>
        )}
      </PanelFade>
      {(trip.destination_unmatched || (trip.country && trip.place)) && (
        <section className="card stack" aria-labelledby="destination-heading">
          <h2 id="destination-heading">Destination</h2>
          <div className="field">
            <label className="field-label" htmlFor="d-typed">
              Destination (typed)
            </label>
            <input className="input" id="d-typed" value={trip.destination ?? ''} disabled readOnly />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="d-country">
              Country
            </label>
            <input className="input" id="d-country" value={trip.country ?? ''} disabled readOnly />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="d-place">
              Place
            </label>
            <input className="input" id="d-place" value={trip.place ?? ''} disabled readOnly />
            {trip.destination_unmatched && (
              <span className="field-hint">
                We couldn't match this destination. Edit it to try again.
              </span>
            )}
          </div>
        </section>
      )}
      </div>
      <aside className="trip-aside" aria-label="Cost summary">
        {trip.cost && (
          <TripTotalCard
            cost={trip.cost}
            costsHref={`/trips/${encodeURIComponent(trip.id)}/costs`}
            insurance={trip.insurance}
          />
        )}
      </aside>
      </div>
      {trip.is_owner && (panel.id === 'settings' || panel.id === 'delete') && (
        <TripSettingsDrawer
          trip={trip}
          covered={panel.id === 'delete'}
          onClose={close}
          onSaved={(updated) => {
            if (!updated.stays?.some((s) => s.outside_trip)) return saved(updated, savedMessage(trip, updated))
            track(updated)
            setPanel({ id: 'stays-review' })
          }}
          onDelete={() => setPanel({ id: 'delete' })}
        />
      )}
      {trip.is_owner && panel.id === 'stays-review' && (
        <StaysReviewDrawer trip={trip} onSaved={track} onClose={close} />
      )}
      {trip.is_owner && panel.id === 'delete' && (
        <DeleteTripModal
          trip={trip}
          onCancel={() => setPanel({ id: 'settings' })}
          onDeleted={() => navigate('/', { state: { toast: 'Trip deleted' } })}
        />
      )}
      {trip.is_owner && panel.id === 'share' && (
        <ShareTripModal
          trip={trip}
          onClose={close}
          onChanged={(updated, message) => {
            setTrip(updated)
            setToast({ id: Date.now(), message })
          }}
          onCopied={() => setToast({ id: Date.now(), message: 'Link copied.' })}
        />
      )}
      {canEdit && panel.id === 'move-restaurant' && (
        <RestaurantPickDialog
          mode="move"
          tripId={trip.id}
          pick={panel.pick}
          days={trip.days ?? []}
          travellers={trip.traveller_count ?? 1}
          onClose={close}
          onDone={saved}
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
      {canEdit && (panel.id === 'reminder-add' || panel.id === 'reminder-edit') && (
        <ReminderModal
          trip={trip}
          reminder={panel.id === 'reminder-edit' ? panel.reminder : undefined}
          optionId={panel.id === 'reminder-add' ? panel.optionId : undefined}
          onClose={close}
          onSaved={saved}
          onDeleted={reminderDeleted}
        />
      )}
      {canEdit && panel.id === 'add-activity' && (
        <AddActivityDrawer
          trip={trip}
          day={panel.day}
          onClose={close}
          onAdded={(updated, name) => saved(updated, `${name} added to ${panel.day.name}.`)}
        />
      )}
      {canEdit && panel.id === 'remove-activity' && (
        <RemoveActivityModal
          tripId={trip.id}
          activity={panel.activity}
          onClose={close}
          onRemoved={(updated, activity) =>
            saved(updated, `${activity.name} removed from ${dayName(activity.date)}.`)
          }
        />
      )}
      {canEdit && (panel.id === 'add-stay' || panel.id === 'edit-stay') && (
        <StayDrawer
          trip={trip}
          stay={panel.id === 'edit-stay' ? panel.stay : undefined}
          onClose={close}
          onSaved={(updated, verb) => {
            const count = updated.stays?.length ?? 0
            saved(updated, `Stay ${verb}. ${count} ${count === 1 ? 'stay' : 'stays'} in this trip.`)
          }}
        />
      )}
      {canEdit && panel.id === 'remove-stay' && (
        <RemoveStayModal
          tripId={trip.id}
          stay={panel.stay}
          onClose={close}
          onRemoved={(updated, stay) =>
            saved(updated, `Removed ${stay.place}, ${formatRange(stay.start_date, stay.end_date)}.`)
          }
        />
      )}
      {panel.id === 'book' && (
        <BookTripDrawer
          options={options}
          sim={trip.sim}
          insurance={trip.insurance}
          restaurants={trip.restaurants ?? []}
          onClose={close}
        />
      )}
      {insuranceCleared && <InsurancePickClearedModal onOk={() => setInsuranceCleared(false)} />}
      {accessRemoved && <AccessRemovedModal onOk={() => navigate('/')} />}
      <Toast key={toast?.id} message={toast?.message ?? null} undo={toast?.undo} />
    </div>
  )
}
