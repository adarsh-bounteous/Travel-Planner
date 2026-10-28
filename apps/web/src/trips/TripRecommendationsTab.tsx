import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { fetchLocalMode } from '../auth/api'
import { AlertIcon, HeartIcon, InfoIcon } from '../auth/icons'
import { useSavedPlaces } from '../places/useSavedPlaces'
import { fetchTripRecommendations } from './api'
import { RecommendationImage } from './RecommendationImage'
import { DestinationGate } from './DestinationGate'
import type { TripRecommendations } from './api'

type Props = {
  tripId: string
  interests: string[]
  onBack: () => void
}

/** Ideas for the trip's chosen place, narrowed to the trip's interests. Open and Save reuse the places flows. */
export function TripRecommendationsTab({ tripId, interests, onBack }: Props) {
  const navigate = useNavigate()
  const { savedIds, toggle, pendingIds, panel } = useSavedPlaces()
  const [view, setView] = useState<TripRecommendations | null>(null)
  const [local, setLocal] = useState(false)
  const [localKnown, setLocalKnown] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(interests))

  useEffect(() => {
    let current = true
    // The mode gates which images may load, so the grid waits for it (a failed check reads as not local).
    void fetchLocalMode()
      .catch(() => false)
      .then((on) => {
        if (!current) return
        setLocal(on)
        setLocalKnown(true)
      })
    // A failed or missing route reads as no recommendations: the empty message says what to do.
    void fetchTripRecommendations(tripId)
      .catch((): TripRecommendations => ({ destination: null, status: 'no_destination', items: [] }))
      .then((found) => current && setView(found))
    return () => {
      current = false
    }
  }, [tripId])

  const toggleInterest = (interest: string) =>
    setSelected((now) => {
      const next = new Set(now)
      if (!next.delete(interest)) next.add(interest)
      return next
    })

  const recs = view?.items ?? []
  const shown = recs.filter((r) => interests.length === 0 || (!!r.interest && selected.has(r.interest)))
  const open = (name: string) =>
    navigate(
      `/destinations?destination=${encodeURIComponent(view?.destination?.place ?? '')}&q=${encodeURIComponent(name)}&trip=${encodeURIComponent(tripId)}`,
    )

  return (
    <div className="stack">
      <p className={`alert cluster ${local ? 'alert-info' : 'alert-warning'}`}>
        {local ? <InfoIcon /> : <AlertIcon />}
        <span>{local ? 'Generated locally.' : 'From the recommendation service.'}</span>
      </p>
      {panel}
      {view === null || !localKnown ? (
        <div className="grid" role="status" aria-label="Loading recommendations">
          {[0, 1, 2].map((n) => (
            <span key={n} className="skeleton card" style={{ aspectRatio: '4 / 3', height: 'auto' }} />
          ))}
        </div>
      ) : (
        <DestinationGate tripId={tripId} destination={view.destination} status={view.status}>
          {interests.length > 0 && (
            <div className="cluster" role="group" aria-label="Trip interests">
              {interests.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className="chip"
                  aria-pressed={selected.has(interest)}
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>
          )}
          {recs.length === 0 ? (
            <div className="empty-state">
              <h2>No recommendations for this destination yet</h2>
              <p>Try another destination, or plan your days in the meantime.</p>
              <button type="button" className="btn btn-primary" onClick={onBack}>
                Back to itinerary
              </button>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty-state">
              <h2>Pick an interest to see ideas</h2>
              <p>Choose one of your trip's interests above.</p>
            </div>
          ) : (
            <ul className="grid">
              {shown.map((r) => {
            const saved = !!r.place && savedIds.has(r.place.id)
            return (
              <li key={r.id} className="card stack">
                <RecommendationImage src={r.place?.image_url} name={r.name} appOnly={local} />
                <h3>{r.name}</h3>
                {r.interest && <span className="badge badge-neutral">{r.interest}</span>}
                <p className="text-sm text-muted">{r.detail}</p>
                <div className="cluster">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={`Open ${r.name}`}
                    onClick={() => open(r.name)}
                  >
                    Open
                  </button>
                  {r.place && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-pressed={saved}
                      aria-label={`${saved ? 'Saved' : 'Save'} ${r.name}`}
                      disabled={pendingIds.has(r.place.id)}
                      onClick={() => void toggle(r.place!)}
                    >
                      <HeartIcon filled={saved} />
                      {saved ? 'Saved' : 'Save'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
            </ul>
          )}
        </DestinationGate>
      )}
    </div>
  )
}
