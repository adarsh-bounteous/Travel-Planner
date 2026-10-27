import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { AlertIcon, SearchIcon } from '../auth/icons'
import { fetchRestaurantShortlist, fetchTrip } from './api'
import type { RestaurantShortlist } from './api'
import { RestaurantCompare } from './RestaurantCompare'
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

/** Compare the matching restaurants, or pick from their ranked shortlist. Removing and choosing live on the page. */
export function RestaurantShortlistPage() {
  const { tripId = '', view = '' } = useParams()
  const [tripName, setTripName] = useState('Trip')
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [removed, setRemoved] = useState<string[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const load = useCallback(() => {
    setResult({ state: 'loading' })
    fetchRestaurantShortlist(tripId)
      .then((shortlist) => setResult({ state: 'ready', shortlist }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => setTripName(trip.name))
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
    setChosen((c) => (c === key ? null : c))
    say(`${name} removed from your shortlist`, () => setRemoved((r) => r.filter((k) => k !== key)))
  }
  const choose = (key: string, name: string) => {
    const now = chosen === key ? null : key
    setChosen(now)
    say(now ? `${name} chosen from your shortlist` : `${name} is no longer chosen`)
  }
  const restore = () => {
    setRemoved([])
    say('Shortlist restored')
  }

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={tripHref}>{tripName}</Link>
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
                  ? `Ranked for your budget of ${formatMoney(shortlist.budget_per_person, shortlist.currency)} per person, then by how many of your preferences each restaurant meets. Choose from this list.`
                  : 'Ranked by how many of your preferences each restaurant meets, then by price. Choose from this list.'}
              </p>
              <div className="stack">
                {visible.map((e) => (
                  <RestaurantShortlistEntry
                    key={restaurantKey(e)}
                    entry={e}
                    budget={shortlist.budget_per_person}
                    currency={shortlist.currency}
                    chosen={chosen === restaurantKey(e)}
                    onRemove={() => remove(restaurantKey(e), e.restaurant.name)}
                    onChoose={() => choose(restaurantKey(e), e.restaurant.name)}
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
      {toast && <Toast key={toast.key} message={toast.message} undo={toast.undo} />}
    </div>
  )
}
