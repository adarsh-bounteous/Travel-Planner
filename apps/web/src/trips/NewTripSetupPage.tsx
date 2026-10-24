import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AlertIcon, ArrowLeftIcon, CheckIcon } from '../auth/icons'
import type { Place } from '../places/api'
import { addPlaceToTrip, createTrip } from './api'
import { Overlay } from './Overlay'
import { TRIP_CURRENCIES, validateTripBasics } from './tripBasics'
import type { TripBasics, TripBasicsErrors } from './tripBasics'

const EMPTY: TripBasics = {
  destination: '',
  start: '',
  end: '',
  travellers: '',
  budget: '',
  currency: '',
  name: '',
}

const SUMMARY_LABELS: Record<keyof TripBasicsErrors, string> = {
  destination: 'Destination',
  dates: 'Dates',
  travellers: 'Number of travellers',
  budget: 'Budget and currency',
  name: 'Trip name',
}

/** Today as an ISO date in the traveller's own time zone. */
const today = () => new Date().toLocaleDateString('en-CA')

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p className="field-error cluster" id={id} role="alert">
      <AlertIcon />
      <span>{message}</span>
    </p>
  )
}

/**
 * Guided New trip set-up: destination, dates, travellers, budget, trip currency and name.
 * Nothing is saved until Finish; leaving discards. Launched with `state.addPlace`, it also adds that place.
 */
export function NewTripSetupPage() {
  const navigate = useNavigate()
  const addPlace = (useLocation().state as { addPlace?: Place } | null)?.addPlace
  const [values, setValues] = useState(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [blocked, setBlocked] = useState(0)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const summary = useRef<HTMLDivElement>(null)

  // Errors only appear after the first Finish, then follow the inputs.
  const errors: TripBasicsErrors = submitted ? validateTripBasics(values, today()) : {}
  const invalid = Object.keys(errors) as (keyof TripBasicsErrors)[]

  useEffect(() => {
    if (blocked > 0) summary.current?.focus()
  }, [blocked])

  const set = (field: keyof TripBasics) => (event: { target: { value: string } }) =>
    setValues({ ...values, [field]: event.target.value })

  // One budget message covers two controls: mark the one(s) it is about.
  const budgetInvalid = !!errors.budget && !(Number(values.budget) > 0)
  const currencyInvalid = !!errors.budget && !values.currency

  const finish = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validateTripBasics(values, today())).length > 0) {
      setBlocked((n) => n + 1)
      return
    }
    setFailed(false)
    setPending(true)
    let trip
    try {
      trip = await createTrip({
        name: values.name.trim(),
        destination: values.destination.trim(),
        start_date: values.start,
        end_date: values.end,
        traveller_count: Number(values.travellers),
        budget: Number(values.budget),
        currency: values.currency,
      })
    } catch {
      setFailed(true)
      setPending(false)
      return
    }
    let placeFailed = false
    if (addPlace) {
      try {
        await addPlaceToTrip(trip.id, {
          place_id: addPlace.id,
          name: addPlace.name,
          image_url: addPlace.image_url,
        })
      } catch {
        placeFailed = true // the trip exists now; Shortlists says the place did not make it
      }
    }
    navigate(`/trips/${trip.id}/shortlists`, {
      state: { toast: 'Trip created. Here are your shortlists.', placeFailed },
    })
  }

  const currency = TRIP_CURRENCIES[values.currency]

  return (
    <div className="narrow stack stack-lg">
      <div>
        <button className="btn btn-ghost" type="button" onClick={() => setLeaving(true)}>
          <ArrowLeftIcon />
          Back
        </button>
      </div>
      <div className="stack stack-sm">
        <h1>New trip</h1>
        <p className="text-muted">Where to next? Five quick details, then your shortlists.</p>
      </div>
      {invalid.length > 0 && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={summary}>
          <p className="alert-title">Finish isn't ready yet.</p>
          <ul className="summary-list">
            {invalid.map((key) => (
              <li key={key}>
                {SUMMARY_LABELS[key]}: {errors[key]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="stack stack-lg" noValidate onSubmit={finish}>
        <div className="field">
          <label className="field-label" htmlFor="setup-destination">
            Destination
          </label>
          <input
            className={`input ${errors.destination ? 'is-invalid' : ''}`}
            aria-invalid={errors.destination ? true : undefined}
            id="setup-destination"
            placeholder="Where are you going?"
            autoComplete="off"
            maxLength={120}
            aria-describedby={errors.destination ? 'setup-destination-e' : 'setup-destination-h'}
            value={values.destination}
            onChange={set('destination')}
          />
          <span className="field-hint" id="setup-destination-h">
            A city or country, like Lisbon or Portugal.
          </span>
          <FieldError id="setup-destination-e" message={errors.destination} />
        </div>
        <div className="stack stack-sm">
          <div className="two">
            <div className="field">
              <label className="field-label" htmlFor="setup-start">
                Start date
              </label>
              <input
                className={`input ${errors.dates ? 'is-invalid' : ''}`}
                aria-invalid={errors.dates ? true : undefined}
                aria-describedby={errors.dates ? 'setup-dates-e' : undefined}
                type="date"
                id="setup-start"
                value={values.start}
                onChange={set('start')}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="setup-end">
                End date
              </label>
              <input
                className={`input ${errors.dates ? 'is-invalid' : ''}`}
                aria-invalid={errors.dates ? true : undefined}
                aria-describedby={errors.dates ? 'setup-dates-e' : undefined}
                type="date"
                id="setup-end"
                value={values.end}
                onChange={set('end')}
              />
            </div>
          </div>
          <FieldError id="setup-dates-e" message={errors.dates} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="setup-travellers">
            Number of travellers
          </label>
          <input
            className={`input ${errors.travellers ? 'is-invalid' : ''}`}
            aria-invalid={errors.travellers ? true : undefined}
            aria-describedby={errors.travellers ? 'setup-travellers-e' : 'setup-travellers-h'}
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="1"
            id="setup-travellers"
            value={values.travellers}
            onChange={set('travellers')}
          />
          <span className="field-hint" id="setup-travellers-h">
            Include yourself. You can add details for others later.
          </span>
          <FieldError id="setup-travellers-e" message={errors.travellers} />
        </div>
        <div className="stack stack-sm">
          <div className="two">
            <div className="field">
              <label className="field-label" htmlFor="setup-budget">
                Budget
              </label>
              <div className="budget-wrap">
                <span className="budget-prefix" aria-hidden="true">
                  {values.currency || '—'}
                </span>
                <input
                  className={`input ${budgetInvalid ? 'is-invalid' : ''}`}
                  aria-invalid={budgetInvalid ? true : undefined}
                  aria-describedby={errors.budget ? 'setup-budget-e' : undefined}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Amount"
                  id="setup-budget"
                  value={values.budget}
                  onChange={set('budget')}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="setup-currency">
                Trip currency
              </label>
              <select
                className={`select ${currencyInvalid ? 'is-invalid' : ''}`}
                aria-invalid={currencyInvalid ? true : undefined}
                aria-describedby={errors.budget ? 'setup-budget-e' : undefined}
                id="setup-currency"
                value={values.currency}
                onChange={set('currency')}
              >
                <option value="">Choose a currency</option>
                {Object.entries(TRIP_CURRENCIES).map(([code, { name }]) => (
                  <option key={code} value={code}>
                    {code} – {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {currency ? (
            <p className="cur-note" aria-live="polite">
              <CheckIcon />
              <span>
                Trip currency: {values.currency}. Everything in this trip is shown in {currency.plural}.
              </span>
            </p>
          ) : (
            <p className="field-hint">Pick the currency you want to plan and track this trip in.</p>
          )}
          <FieldError id="setup-budget-e" message={errors.budget} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="setup-name">
            Trip name
          </label>
          <input
            className={`input ${errors.name ? 'is-invalid' : ''}`}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'setup-name-e' : 'setup-name-h'}
            id="setup-name"
            placeholder="Name your trip"
            maxLength={60}
            autoComplete="off"
            value={values.name}
            onChange={set('name')}
          />
          <span className="field-hint" id="setup-name-h">
            Something you'll recognise, like “Lisbon long weekend”.
          </span>
          <FieldError id="setup-name-e" message={errors.name} />
        </div>
        {failed && (
          <p className="alert alert-danger" role="alert">
            We couldn't save this trip. Try again.
          </p>
        )}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Creating trip…
              </>
            ) : (
              'Finish'
            )}
          </button>
        </div>
      </form>
      {leaving && (
        <Overlay kind="modal" labelledBy="leave-setup-title" onClose={() => setLeaving(false)}>
          <div className="stack stack-lg">
            <h3 className="text-lg" id="leave-setup-title">
              Leave set-up?
            </h3>
            <p>Your trip is not saved until you finish set-up.</p>
            <div className="overlay-actions end">
              <button className="btn btn-secondary" type="button" onClick={() => setLeaving(false)}>
                Keep editing
              </button>
              <button className="btn btn-primary" type="button" onClick={() => navigate('/')}>
                Leave
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
