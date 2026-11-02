import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CheckIcon, EyeIcon, SuitcaseIcon } from '../auth/icons'
import { Toast } from '../trips/Toast'
import { fetchStarterDestinations } from './starterApi'
import type { StarterCountry } from './starterApi'
import { DestinationPicker } from '../trips/DestinationPicker'

/** Where the starter planner lives; Back to trip on the content page returns here. */
export const STARTER_PLAN_PATH = '/trips/plan'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; countries: StarterCountry[] }
type Picks = { country?: string; place?: string }

const NO_STARTER_CONTENT = 'Only starter destinations have place content. You can still book this trip.'

// Booking only confirms the pick; nothing is saved, so this is a short pause for the spinner, not a wait.
const BOOKING_MS = 300

export function StarterPlannerPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const back = (useLocation().state as Picks | null) ?? {}
  const [destination, setDestination] = useState(
    back.country && back.place ? `${back.place}, ${back.country}` : '',
  )
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState<{ destination: string; at: number } | null>(null)

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
      setBooked({ destination, at: Date.now() })
    }, BOOKING_MS)
    return () => clearTimeout(timer)
  }, [booking, destination])

  // A starter pick is "Place, Country" found in the catalogue; a live pick has no starter content.
  const countries = load.status === 'loaded' ? load.countries : []
  const [pickedPlace, pickedCountry] = destination.split(', ')
  const country = countries.find((c) => c.name === pickedCountry)
  const place = country?.places.find((p) => p === pickedPlace)
  const ready = country && place
  const picked = destination !== ''

  const pick = (next: string) => {
    setDestination(next)
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
        <DestinationPicker idPrefix="plan" value={destination} onChange={pick} />
        {destination !== '' && !ready && (
          <p className="field-hint" role="status">
            {NO_STARTER_CONTENT}
          </p>
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
              <EyeIcon />
              View place content
            </Link>
          ) : (
            <a className="btn btn-ghost" aria-disabled="true" role="link">
              <EyeIcon />
              View place content
            </a>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={!picked || booking}
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
            <span className="check-badge is-big is-playing" role="img" aria-label="Booking complete">
              <CheckIcon />
            </span>
            <p className="alert-title">
              Trip booked: {booked.destination}
            </p>
            <p>
              {ready
                ? 'Your sample stay and activities are ready to review. View place content to see them.'
                : 'Your pick is saved on this page. Start a trip from the results to plan it.'}
            </p>
          </div>
          <Toast key={booked.at} message="Trip booked" />
        </>
      )}
    </div>
  )
}
