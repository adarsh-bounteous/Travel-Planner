import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { AlertIcon, SearchIcon } from '../auth/icons'
import { fetchRestaurantShortlist, fetchTrip } from './api'
import type { RestaurantShortlist, ShortlistEntry, Trip } from './api'
import { RestaurantCompare } from './RestaurantCompare'
import { RestaurantPickDialog } from './RestaurantPickDialog'
import { RestaurantShortlistEntry } from './RestaurantShortlistEntry'
import { formatMoney, plural } from './stayOptions'
import { Toast } from './Toast'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; shortlist: RestaurantShortlist }
type ToastState = { key: number; message: string; undo?: () => void }

const VIEWS = [
  { id: 'compare', label: 'Compare', heading: 'Compare restaurants' },
  { id: 'shortlist', label: 'Shortlist', heading: 'Restaurant shortlist' },
]

const restaurantKey = (e: { restaurant: { name: string; city: string } }) => `${e.restaurant.name}-${e.restaurant.city}`

/** Compare the matching restaurants, or pick from their ranked shortlist. Removing and adding to the trip live on the page. */
export function RestaurantShortlistPage() {
  const { tripId = '', view = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [removed, setRemoved] = useState<string[]>([])
  const [adding, setAdding] = useState<ShortlistEntry | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const load = useCallback(() => {
    setResult({ state: 'loading' })
    fetchRestaurantShortlist(tripId)
      .then((shortlist) => setResult({ state: 'ready', shortlist }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  useEffect(() => {
    fetchTrip(tripId)
      .then(setTrip)
      .catch(() => undefined)
    load()
  }, [tripId, load])

  const tripHref = `/trips/${encodeURIComponent(tripId)}`
  const optionsHref = `${tripHref}/restaurant-options`
  const current = VIEWS.find((v) => v.id === view)
  if (!current) return <Navigate to={`${optionsHref}/shortlist`} replace />

  const say = (message: string, undo?: () => void) => setToast({ key: Date.now(), message, undo })
  const shortlist = result.state === 'ready' ? result.shortlist : null
  const visible = shortlist?.entries.filter((e) => !removed.includes(restaurantKey(e))) ?? []

  const remove = (key: string, name: string) => {
    setRemoved((r) => [...r, key])
    say(`${name} removed from your shortlist`, () => setRemoved((r) => r.filter((k) => k !== key)))
  }
  const added = (updated: Trip, message: string) => {
    setTrip(updated)
    setAdding(null)
    say(message)
  }
  const travellers = trip?.traveller_count ?? 1
  const restore = () => {
    setRemoved([])
    say('Shortlist restored')
  }

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={tripHref}>{trip?.name ?? 'Trip'}</Link>
          </li>
          <li>
            <Link to={optionsHref}>Restaurants</Link>
          </li>
          <li aria-current="page">{current.label}</li>
        </ol>
      </nav>
      <h1>{current.heading}</h1>
      <div className="tabs" role="tablist" aria-label="Restaurant views">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            className="tab"
            role="tab"
            aria-selected={v.id === current.id}
            to={`${optionsHref}/${v.id}`}
          >
            {v.label}
          </Link>
        ))}
      </div>

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
        <div className="alert alert-danger stack" role="alert">
          <span>
            <AlertIcon />
            We couldn't load the restaurants. Check your connection and try again.
          </span>
          <button className="btn btn-secondary" type="button" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {shortlist && current.id === 'compare' && (
        <RestaurantCompare entries={shortlist.entries} optionsHref={optionsHref} />
      )}

      {shortlist && current.id === 'shortlist' && (
        <>
          {visible.length > 0 && (
            <>
              <p className="text-muted">
                {shortlist.budget_per_person !== null && shortlist.currency
                  ? `Ranked for your budget of ${formatMoney(shortlist.budget_per_person, shortlist.currency)} per person, then by how many of your preferences each restaurant meets. Add as many as you like. Estimates use your group of ${plural(travellers, 'traveller', 'travellers')}.`
                  : `Ranked by how many of your preferences each restaurant meets, then by price. Add as many as you like. Estimates use your group of ${plural(travellers, 'traveller', 'travellers')}.`}
              </p>
              <div className="stack">
                {visible.map((e) => (
                  <RestaurantShortlistEntry
                    key={restaurantKey(e)}
                    entry={e}
                    budget={shortlist.budget_per_person}
                    currency={shortlist.currency}
                    added={(trip?.restaurants ?? []).some(
                      (p) => p.name === e.restaurant.name && p.city === e.restaurant.city,
                    )}
                    onRemove={() => remove(restaurantKey(e), e.restaurant.name)}
                    onAdd={() => setAdding(e)}
                  />
                ))}
              </div>
            </>
          )}
          {visible.length === 0 && (
            <div className="empty-state">
              <SearchIcon />
              <h2>{shortlist.entries.length === 0 ? 'No restaurants to shortlist' : 'Your shortlist is empty'}</h2>
              {shortlist.entries.length === 0 ? (
                <>
                  <p>No restaurants match this trip yet. Relax a filter to find more.</p>
                  <div className="cluster">
                    <Link className="btn btn-primary" to={optionsHref}>
                      Back to restaurant options
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p>You removed every restaurant, so there is nothing to choose from. Restore the matches to pick again.</p>
                  <div className="cluster">
                    <button className="btn btn-primary" type="button" onClick={restore}>
                      Restore shortlist
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <p className="text-muted text-sm" role="status" aria-live="polite">
            {visible.length > 0
              ? `${plural(visible.length, 'restaurant', 'restaurants')} on your shortlist`
              : 'Your shortlist is empty'}
          </p>
        </>
      )}
      {adding && trip && (
        <RestaurantPickDialog
          mode="add"
          tripId={tripId}
          restaurant={adding.restaurant}
          days={trip.days ?? []}
          travellers={travellers}
          onClose={() => setAdding(null)}
          onDone={added}
        />
      )}
      {toast && <Toast key={toast.key} message={toast.message} undo={toast.undo} />}
    </div>
  )
}
