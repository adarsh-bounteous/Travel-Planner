import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CheckIcon, MapPinIcon, SuitcaseIcon } from '../auth/icons'
import { Toast } from '../trips/Toast'
import { fetchStarterDestinations } from './starterApi'
import type { StarterCountry } from './starterApi'
import { StarterSelect } from './StarterSelect'

/** Where the starter planner lives; Back to trip on the content page returns here. */
export const STARTER_PLAN_PATH = '/trips/plan'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; countries: StarterCountry[] }
type Picks = { country?: string; place?: string }

// Booking only confirms the pick; nothing is saved, so this is a short pause for the spinner, not a wait.
const BOOKING_MS = 300

export function StarterPlannerPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [picks, setPicks] = useState<Picks>((useLocation().state as Picks | null) ?? {})
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState<{ country: string; place: string; at: number } | null>(null)

  useEffect(() => {
    let active = true
    fetchStarterDestinations().then(
      (countries) => active && setLoad({ status: 'loaded', countries }),
      () => active && setLoad({ status: 'failed' }),
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!booking) return
    const timer = setTimeout(() => {
      setBooking(false)
      setBooked({ country: picks.country!, place: picks.place!, at: Date.now() })
    }, BOOKING_MS)
    return () => clearTimeout(timer)
  }, [booking, picks])

  const countries = load.status === 'loaded' ? load.countries : []
  const country = countries.find((c) => c.name === picks.country)
  const place = country?.places.find((p) => p === picks.place)
  const ready = country && place

  const pickCountry = (name: string) => {
    setPicks({ country: name })
    setBooked(null)
  }
  const pickPlace = (name: string) => {
    setPicks((now) => ({ ...now, place: name }))
    setBooked(null)
  }

  return (
    <div className="planner stack stack-lg">
      <h1>Plan a trip</h1>
      {load.status === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <p className="alert-title">We couldn't load the starter destinations.</p>
          <p>Check your connection and try again.</p>
        </div>
      )}
      <div className="card stack">
        {load.status === 'loading' ? (
          <div className="stack" aria-busy="true">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        ) : (
          <>
            <div className="field">
              <span className="field-label" id="dest-label">
                Destination
              </span>
              <StarterSelect
                labelId="dest-label"
                listLabel="Countries"
                options={countries.map((c) => c.name)}
                value={country?.name ?? null}
                placeholder="Choose a country"
                onChange={pickCountry}
              />
              <span className="field-hint">{countries.length} starter countries to explore.</span>
            </div>
            <div className="field">
              <span className="field-label" id="place-label">
                Place
              </span>
              <StarterSelect
                labelId="place-label"
                listLabel="Places"
                options={country?.places ?? []}
                value={place ?? null}
                placeholder="Choose a place"
                disabled={!country}
                onChange={pickPlace}
              />
              <span className="field-hint">
                {country
                  ? country.places.length === 0
                    ? `No starter places are available for ${country.name}.`
                    : `${country.places.length} places in ${country.name}.`
                  : `Pick a country first to see its ${countries[0]?.places.length ?? 3} places.`}
              </span>
            </div>
          </>
        )}
        {ready && (
          <p className="ready" role="status">
            <CheckIcon />
            <span>
              Starter content ready for {place}: places, restaurants, stays, activities and medical
              guidance.
            </span>
          </p>
        )}
        <div className="row-between">
          {ready ? (
            <Link
              className="btn btn-ghost"
              to={`${STARTER_PLAN_PATH}/${encodeURIComponent(country.name)}/${encodeURIComponent(place)}`}
            >
              <MapPinIcon />
              View place content
            </Link>
          ) : (
            <a className="btn btn-ghost" aria-disabled="true" role="link">
              <MapPinIcon />
              View place content
            </a>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={!ready || booking}
            onClick={() => setBooking(true)}
          >
            <SuitcaseIcon />
            {booking ? (
              <>
                <span className="spinner" aria-hidden="true" /> Booking trip
              </>
            ) : (
              'Book trip'
            )}
          </button>
        </div>
      </div>
      {booked && (
        <>
          <div className="alert alert-success" role="status">
            <p className="alert-title">
              Trip booked: {booked.place}, {booked.country}
            </p>
            <p>Your sample stay and activities are ready to review. View place content to see them.</p>
          </div>
          <Toast key={booked.at} message="Trip booked" />
        </>
      )}
    </div>
  )
}
