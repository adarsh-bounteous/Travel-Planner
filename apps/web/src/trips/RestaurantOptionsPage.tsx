import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { AlertIcon, EditIcon, HeartIcon, ListIcon, PlusIcon, RefreshIcon, SearchIcon, UserIcon } from '../auth/icons'
import { fetchRestaurantOptions, fetchTrip } from './api'
import type { RestaurantOption, RestaurantOptions, Trip } from './api'
import { DestinationGate } from './DestinationGate'
import { DiningNeedsDrawer } from './DiningNeedsDrawer'
import { RestaurantLink } from './RestaurantLink'
import { formatMoney, plural } from './stayOptions'
import { OptionCard } from '../components/OptionCard'
import { Toast } from './Toast'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; options: RestaurantOptions }

function RestaurantCard({ option, home }: { option: RestaurantOption; home: boolean }) {
  return (
    <OptionCard
      illustration={{ placeType: 'food' }}
      title={option.name}
      badges={<span className={home ? 'badge badge-success' : 'badge'}>{option.cuisine}</span>}
      meta={`${option.cuisine} cuisine, ${option.dining_style.toLowerCase()} dining. ${option.typical_price === null ? 'Typical price not available.' : `Typically ${formatMoney(option.typical_price, option.currency)} per person.`}`}
      actions={<RestaurantLink name={option.name} url={option.url} />}
    />
  )
}

/** Restaurants at the trip destination that respect the owner's profile plus the needs added for this trip. */
export function RestaurantOptionsPage() {
  const { tripId = '' } = useParams()
  const [trip, setTrip] = useState<Trip>({ id: tripId, name: 'Trip' })
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState<{ key: number; message: string } | null>(null)

  const load = () => {
    fetchTrip(tripId)
      .then(setTrip)
      .catch(() => undefined)
    return fetchRestaurantOptions(tripId)
      .then((options) => setResult({ state: 'ready', options }))
      .catch(() => setResult({ state: 'failed' }))
  }

  useEffect(() => {
    setResult({ state: 'loading' })
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  const applied = () => {
    setEditing(false)
    setToast({ key: Date.now(), message: `Needs applied to your ${trip.destination ?? trip.name} trip` })
    load()
  }

  const ready = result.state === 'ready' ? result.options : null
  const profileChips = ready?.filters_applied.profile ?? []
  const tripChips = ready?.filters_applied.trip ?? []
  const homeNote = ready?.options.some((o) => o.cuisine === ready.home_cuisine) ?? false
  const empty = ready !== null && ready.options.length === 0
  const edit = () => setEditing(true)

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/trips">Trips</Link>
          </li>
          <li>
            <Link to={`/trips/${encodeURIComponent(tripId)}`}>{trip.name}</Link>
          </li>
          <li aria-current="page">Dining</li>
        </ol>
      </nav>
      <h1>Restaurants</h1>

      {result.state === 'loading' && (
        <div className="grid" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card skel-card">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {result.state === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          We couldn't load restaurants. Check your connection and try again.
        </div>
      )}
      {ready && (
        <DestinationGate tripId={tripId} destination={ready.destination} status={ready.status}>
      {!empty && (
        <div className="row-between">
          <Link className="btn btn-secondary" to={`/trips/${encodeURIComponent(tripId)}/restaurant-options/compare`}>
            <ListIcon />
            Compare matches
          </Link>
          <Link className="btn btn-primary" to={`/trips/${encodeURIComponent(tripId)}/restaurant-options/shortlist`}>
            <HeartIcon />
            View shortlist
          </Link>
        </div>
      )}

        <div className="stack stack-sm">
          <div className="filter-row">
            <div className="cluster" role="group" aria-label="Filters applied">
              {profileChips.map((label) => (
                <span key={`p-${label}`} className="chip chip-static is-selected">
                  <UserIcon />
                  {label}
                </span>
              ))}
              {tripChips.map((label) => (
                <span key={`t-${label}`} className="chip chip-static chip-trip is-selected">
                  <PlusIcon />
                  {label}
                </span>
              ))}
            </div>
            {trip.is_owner && !empty && (
              <button className="btn btn-secondary" type="button" onClick={edit}>
                <EditIcon />
                Edit trip needs
              </button>
            )}
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <UserIcon />
              From your profile
            </span>
            <span>
              <PlusIcon />
              Added for this trip only
            </span>
          </div>
        </div>

      {homeNote && <p className="text-muted">{`${ready.home_cuisine} restaurants are listed first.`}</p>}

      {empty && (
        <div className="empty-state" role="status">
          <EmptyStateArt />
          <SearchIcon />
          <h2>No restaurants match your filters.</h2>
          <p>Try relaxing a filter, such as budget or a trip need, to see more options.</p>
          {trip.is_owner && (
            <div className="cluster">
              <button className="btn btn-ghost" type="button" onClick={edit}>
                <RefreshIcon />
                Relax filters
              </button>
              <button className="btn btn-primary" type="button" onClick={edit}>
                <EditIcon />
                Edit trip needs
              </button>
            </div>
          )}
        </div>
      )}
      {!empty && (
        <>
          <div className="grid">
            {ready.options.map((o) => (
              <RestaurantCard key={`${o.name}-${o.city}`} option={o} home={o.cuisine === ready.home_cuisine} />
            ))}
          </div>
          <p className="text-muted text-sm" role="status" aria-live="polite">
            {`Showing ${plural(ready.options.length, 'matching restaurant', 'matching restaurants')}`}
          </p>
        </>
      )}
        </DestinationGate>
      )}

      {editing && (
        <DiningNeedsDrawer
          tripId={tripId}
          needs={trip.dining_needs ?? []}
          profileFilters={profileChips}
          onClose={() => setEditing(false)}
          onApplied={applied}
        />
      )}
      {toast && <Toast key={toast.key} message={toast.message} />}
    </div>
  )
}
