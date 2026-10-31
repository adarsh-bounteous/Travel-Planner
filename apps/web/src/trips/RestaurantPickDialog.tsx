import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertIcon, ArrowRightIcon, PlusIcon, UtensilsIcon, XIcon } from '../auth/icons'
import { moveRestaurant, pickRestaurant } from './api'
import type { Day, Meal, RestaurantPick, Trip } from './api'
import { Overlay } from './Overlay'
import { defaultDay, estimateLabel, MEALS, mealLabel } from './restaurantPicks'
import { formatMoney } from './TripTotalCard'

type Shared = {
  tripId: string
  days: Day[]
  travellers: number
  onClose: () => void
  /** The trip as the server now has it, and the message to confirm the change. */
  onDone: (trip: Trip, message: string) => void
}
type Props =
  | (Shared & {
      mode: 'add'
      restaurant: { name: string; city: string; typical_price: string | null; currency: string }
    })
  | (Shared & { mode: 'move'; pick: RestaurantPick })

/** Add a shortlisted restaurant to the trip, or move a pick to another day or meal. '' is Unscheduled. */
export function RestaurantPickDialog(props: Props) {
  const { tripId, days, travellers, onClose, onDone } = props
  const subject = props.mode === 'add' ? props.restaurant : props.pick
  // A new pick starts on the first day at dinner so it lands in the itinerary; a move keeps the pick's own place.
  const [day, setDay] = useState(props.mode === 'move' ? (props.pick.date ?? '') : defaultDay(days))
  const [meal, setMeal] = useState<Meal | null>(
    props.mode === 'move' ? props.pick.meal : defaultDay(days) ? 'dinner' : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const firstMeal = useRef<HTMLInputElement>(null)

  const dayName = (date: string) => days.find((d) => d.date === date)?.name ?? date
  const changeDay = (value: string) => {
    setDay(value)
    setError(null)
    if (value === '') setMeal(null)
    else if (meal === null) setMeal('dinner')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (day !== '' && meal === null) {
      setError(`Choose a meal for ${dayName(day)}, or switch the day to Unscheduled.`)
      firstMeal.current?.focus()
      return
    }
    setError(null)
    setFailed(false)
    setPending(true)
    const where = { date: day === '' ? null : day, meal }
    try {
      if (props.mode === 'add') {
        const updated = await pickRestaurant(tripId, { name: subject.name, city: subject.city, ...where })
        const place = meal === null ? 'Unscheduled' : `${dayName(day)}, ${mealLabel(meal).toLowerCase()}`
        onDone(updated, `${subject.name} added to ${place}`)
      } else {
        const updated = await moveRestaurant(tripId, props.pick.id, where)
        onDone(updated, `${subject.name} moved to ${day === '' ? 'Unscheduled' : dayName(day)}`)
      }
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  const adding = props.mode === 'add'
  const price = subject.typical_price
  return (
    <Overlay kind="drawer" labelledBy="pick-title" onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <h2 className="text-lg" id="pick-title">
          <UtensilsIcon />
          {adding ? 'Add to trip' : 'Move restaurant'}
        </h2>
        <p className="text-bold">{subject.name}</p>
        <div className="field">
          <label className="field-label" htmlFor="pick-day">
            Day
          </label>
          <select
            className="select"
            id="pick-day"
            aria-describedby="pick-day-hint"
            value={day}
            onChange={(event) => changeDay(event.target.value)}
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.name}
              </option>
            ))}
            <option value="">Unscheduled</option>
          </select>
          <span className="field-hint" id="pick-day-hint">
            {days.length === 0
              ? 'This trip has no dates yet, so picks go to Unscheduled.'
              : "Choose Unscheduled if you haven't decided. You can give it a day later."}
          </span>
        </div>
        <div className={`field${error ? ' is-invalid' : ''}`}>
          <fieldset
            className="meals"
            disabled={day === ''}
            aria-describedby={error ? 'pick-meal-hint pick-error' : 'pick-meal-hint'}
          >
            <legend className="field-label">Meal</legend>
            <div className="cluster">
              {MEALS.map((m, index) => (
                <label key={m.id} className="meal-option">
                  <input
                    ref={index === 0 ? firstMeal : undefined}
                    className="radio"
                    type="radio"
                    name="pick-meal"
                    value={m.id}
                    checked={meal === m.id}
                    aria-invalid={error ? true : undefined}
                    onChange={() => {
                      setMeal(m.id)
                      setError(null)
                    }}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
          <span className="field-hint" id="pick-meal-hint">
            {day === '' ? 'Pick a day first to choose a meal.' : 'Choose breakfast, lunch or dinner.'}
          </span>
          {error && (
            <span className="field-error" id="pick-error" role="alert">
              {error}
            </span>
          )}
        </div>
        {adding && (
          <div className="stack stack-sm" role="status">
            <span className="badge badge-neutral">{estimateLabel(subject, travellers)}</span>
            <p className="field-hint">
              {price === null
                ? `No typical price is known for ${subject.name}, so it won't count toward your trip total.`
                : `Estimate: ${formatMoney(Number(price), subject.currency)} per person x ${travellers} ${travellers === 1 ? 'traveller' : 'travellers'}. Included in your trip total.`}
            </p>
          </div>
        )}
        {failed && (
          <div className="alert alert-danger" role="alert">
            <AlertIcon />
            {adding ? "We couldn't add that restaurant. Try again." : "We couldn't move that restaurant. Try again."}
          </div>
        )}
        <div className="row-end">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {adding ? <PlusIcon /> : <ArrowRightIcon />}
            {adding ? (pending ? 'Adding…' : 'Add to trip') : pending ? 'Moving…' : 'Move'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <XIcon />
            Cancel
          </button>
        </div>
      </form>
    </Overlay>
  )
}
