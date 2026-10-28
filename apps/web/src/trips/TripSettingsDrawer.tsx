import { useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { AlertIcon, TrashIcon } from '../auth/icons'
import { updateTrip } from './api'
import type { Trip } from './api'
import { DestinationPicker } from './DestinationPicker'
import { Overlay } from './Overlay'

const MAX_DAYS = 60
const MS_PER_DAY = 86_400_000
const BUDGET_PATTERN = /^\d+(\.\d{1,2})?$/

type Field = 'name' | 'destination' | 'dates' | 'budget'
type Errors = Partial<Record<Field, string>>

type TripSettingsDrawerProps = {
  trip: Trip
  covered: boolean
  onClose: () => void
  onSaved: (trip: Trip) => void
  onDelete: () => void
}

const dayCount = (start: string, end: string) =>
  (Date.parse(end) - Date.parse(start)) / MS_PER_DAY + 1

export function TripSettingsDrawer({
  trip,
  covered,
  onClose,
  onSaved,
  onDelete,
}: TripSettingsDrawerProps) {
  const [name, setName] = useState(trip.name)
  const [destination, setDestination] = useState(trip.destination ?? '')
  const [start, setStart] = useState(trip.start_date ?? '')
  const [end, setEnd] = useState(trip.end_date ?? '')
  const [budget, setBudget] = useState(trip.budget == null ? '' : String(trip.budget))
  const [errors, setErrors] = useState<Errors>({})
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const startInput = useRef<HTMLInputElement>(null)
  const endInput = useRef<HTMLInputElement>(null)
  const budgetInput = useRef<HTMLInputElement>(null)
  const currency = trip.currency ?? 'EUR'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: Errors = {}
    const focusOn: Partial<Record<Field, RefObject<HTMLInputElement | null>>> = {}
    const rawBudget = budget.trim().replace(/\s/g, '')
    if (name.trim() === '') {
      found.name = `Trip name can't be blank. Enter a name such as "Lisbon Spring".`
      focusOn.name = nameInput
    }
    if (destination === '') found.destination = 'Choose a country and a place.'
    if (Boolean(start) !== Boolean(end)) {
      found.dates = 'Choose a start and an end date. Each date becomes a day.'
      focusOn.dates = start ? endInput : startInput
    } else if (start && end < start) {
      found.dates = 'The end date is before the start date. Pick an end date on or after the start.'
      focusOn.dates = endInput
    } else if (start && dayCount(start, end) > MAX_DAYS) {
      found.dates = `Trips can span up to ${MAX_DAYS} days. Shorten the dates.`
      focusOn.dates = endInput
    }
    if (rawBudget !== '' && !BUDGET_PATTERN.test(rawBudget)) {
      found.budget = "Budget can't be negative or text. Enter an amount like 1500."
      focusOn.budget = budgetInput
    }
    setErrors(found)
    setFailed(false)
    const first = focusOn.name ?? focusOn.dates ?? focusOn.budget
    if (first) {
      first.current?.focus()
      return
    }
    if (found.destination) return
    setPending(true)
    try {
      onSaved(
        await updateTrip(trip.id, {
          name: name.trim(),
          destination,
          start_date: start || null,
          end_date: end || null,
          budget: rawBudget === '' ? null : Number(rawBudget),
        }),
      )
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  const invalid = (field: Field) => (errors[field] ? ' is-invalid' : '')
  const describedBy = (field: Field, hint?: string) =>
    [hint, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(' ') || undefined
  const error = (field: Field) =>
    errors[field] && (
      <p className="field-error cluster" id={`${field}-error`} role="alert">
        <AlertIcon />
        <span>{errors[field]}</span>
      </p>
    )

  return (
    <Overlay kind="drawer" labelledBy="settings-title" covered={covered} onClose={onClose}>
      <form className="stack stack-lg" noValidate onSubmit={submit}>
        <h2 id="settings-title">Trip settings</h2>
        <div className={`field${invalid('name')}`}>
          <label className="field-label" htmlFor="trip-name-input">
            Trip name
          </label>
          <input
            ref={nameInput}
            className="input"
            id="trip-name-input"
            autoComplete="off"
            maxLength={120}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy('name', 'name-hint')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <span className="field-hint" id="name-hint">
            Shown to everyone on the trip.
          </span>
          {error('name')}
        </div>
        <DestinationPicker
          idPrefix="settings"
          value={destination}
          onChange={setDestination}
          error={errors.destination}
        />
        <div className={`field${invalid('dates')}`}>
          <label className="field-label" htmlFor="start-date-input">
            Start date
          </label>
          <input
            ref={startInput}
            className="input"
            id="start-date-input"
            type="date"
            aria-invalid={errors.dates ? true : undefined}
            aria-describedby={describedBy('dates', 'dates-hint')}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className={`field${invalid('dates')}`}>
          <label className="field-label" htmlFor="end-date-input">
            End date
          </label>
          <input
            ref={endInput}
            className="input"
            id="end-date-input"
            type="date"
            aria-invalid={errors.dates ? true : undefined}
            aria-describedby={describedBy('dates', 'dates-hint')}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
          <span className="field-hint" id="dates-hint">
            Each date is a day. Days outside the new dates are removed; the rest keep their names.
          </span>
          {error('dates')}
        </div>
        <div className={`field${invalid('budget')}`}>
          <label className="field-label" htmlFor="budget-input">
            {`Budget (${currency})`}
          </label>
          <input
            ref={budgetInput}
            className="input"
            id="budget-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Amount"
            aria-invalid={errors.budget ? true : undefined}
            aria-describedby={describedBy('budget', 'budget-hint')}
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
          <span className="field-hint" id="budget-hint">
            Numbers only, for example 1500.
          </span>
          {error('budget')}
        </div>
        {failed && (
          <p className="alert alert-danger" role="alert">
            We couldn't save this trip. Check the dates and try again.
          </p>
        )}
        <div className="overlay-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <hr className="divider" />
        <div className="stack stack-sm">
          <p className="text-sm text-muted">
            Deleting removes the trip and all of its days. You'll be asked to confirm first.
          </p>
          <button className="btn btn-ghost btn-danger-ghost" type="button" onClick={onDelete}>
            <TrashIcon />
            Delete trip
          </button>
        </div>
      </form>
    </Overlay>
  )
}
