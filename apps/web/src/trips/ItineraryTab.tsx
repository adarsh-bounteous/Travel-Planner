import { useState } from 'react'
import { Link } from 'react-router'
import { BellIcon, CalendarIcon, EditIcon, PlusIcon } from '../auth/icons'
import type { Activity, ChosenOption, ChosenStay, Day, Reminder, RestaurantPick, Trip } from './api'
import { LEGS, legName, pickSummary } from './flights'
import { estimateLabel, mealLabel, picksForDay, unscheduled } from './restaurantPicks'
import { formatRange } from './stays'
import { formatMoney } from './TripTotalCard'

// Dates are plain calendar days, so format them in UTC: 3 March must stay 3 March everywhere.
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const formatDay = (iso: string) => dayMonth.format(asDate(iso))

type NoteProps = {
  reminder: Reminder
  editable: boolean
  onEdit: (reminder: Reminder) => void
  /** Title of the activity the note is for, when it is not shown under that activity. */
  activity?: string
}

function Note({ reminder, editable, onEdit, activity }: NoteProps) {
  return (
    <div className="note">
      <BellIcon />
      <span className="badge">
        <CalendarIcon />
        &nbsp;{formatDay(reminder.date)}
      </span>
      <span className="note-text">
        {reminder.text}
        {activity && <span className="note-for"> for {activity}</span>}
      </span>
      {editable && (
        <button
          className="btn btn-ghost"
          type="button"
          aria-label={`Edit reminder: ${reminder.text}`}
          onClick={() => onEdit(reminder)}
        >
          Edit
        </button>
      )}
    </div>
  )
}

/** An option's price in the trip currency; a foreign price also shows the rate it was converted at. */
function OptionPrice({ option, trip }: { option: ChosenOption; trip: Trip }) {
  if (option.price == null) return <div className="opt-price">No price</div>
  const tripCurrency = trip.currency ?? 'EUR'
  const currency = option.currency ?? tripCurrency
  const rate = trip.cost?.rates.find((r) => r.currency === currency)?.rate
  if (currency === tripCurrency || rate === undefined)
    return <div className="opt-price">{formatMoney(option.price, currency)}</div>
  return (
    <div className="opt-price">
      {formatMoney(option.price * rate, tripCurrency)}
      <small>{`${formatMoney(option.price, currency)} at ${rate}`}</small>
    </div>
  )
}

/** A chosen stay's cost in the trip currency; a foreign cost also shows the rate it was converted at. */
function StayCost({ chosen, trip }: { chosen: ChosenStay; trip: Trip }) {
  const tripCurrency = trip.currency ?? 'EUR'
  const rate = trip.cost?.rates.find((r) => r.currency === chosen.currency)?.rate
  if (chosen.currency === tripCurrency || rate === undefined)
    return <span className="option-cost">{formatMoney(Number(chosen.total), chosen.currency)}</span>
  return (
    <span className="option-cost">
      {formatMoney(Number(chosen.total) * rate, tripCurrency)}
      <small>{` ${formatMoney(Number(chosen.total), chosen.currency)} at ${rate}`}</small>
    </span>
  )
}

/** The stays that have a chosen stay, with their dates and cost; booking is on the provider's site. */
function ChosenStays({ trip, editable }: { trip: Trip; editable: boolean }) {
  const all = trip.stays ?? []
  const stays = all.filter((s) => s.chosen)
  const first = all[0]
  // A trip with no Stay rows has nothing to choose for yet; its Stays tab is where one is added.
  if (!first) return null
  return (
    <section className="stack" aria-labelledby="itinerary-stays">
      <h3 id="itinerary-stays">Stays</h3>
      {stays.length === 0 && (
        <div className="empty-state">
          <h3>No stay in your itinerary</h3>
          <p className="text-muted">
            {`Choose a stay for ${formatRange(first.start_date, first.end_date)} and it will show up here.`}
          </p>
          {editable && (
            <Link
              className="btn btn-primary"
              to={`/trips/${encodeURIComponent(trip.id)}/stays/${encodeURIComponent(first.id)}/shortlist`}
            >
              Choose a stay
            </Link>
          )}
        </div>
      )}
      {stays.map((s) => (
        <div className="card row-between" key={s.id}>
          <span>
            <span className="text-bold">{s.chosen!.name}</span>
            {`, ${formatRange(s.start_date, s.end_date)}`}
          </span>
          <StayCost chosen={s.chosen!} trip={trip} />
        </div>
      ))}
      {stays.length > 0 && <p className="text-sm text-muted">Final price confirmed on provider's site.</p>}
    </section>
  )
}

/** Every transport pick with its leg, and the trip total; booking is on the provider's site. */
function ChosenTransport({ trip }: { trip: Trip }) {
  const picks = trip.transport ?? []
  const destination = trip.destination ?? 'your destination'
  return (
    <div className="card stack" aria-labelledby="itinerary-transport">
      <h2 className="text-lg" id="itinerary-transport">
        Chosen options
      </h2>
      {picks.length === 0 ? (
        <p className="text-muted">No transport picked yet. Pick transport on the trip.</p>
      ) : (
        <ul className="chosen">
          {LEGS.map((leg) => {
            const pick = picks.find((p) => p.leg === leg)
            return (
              pick && (
                <li key={leg}>
                  <span className="text-muted">{`${legName(leg, destination)}: `}</span>
                  {pickSummary(pick)}
                </li>
              )
            )
          })}
        </ul>
      )}
      {trip.cost && <p className="text-bold">{`Trip total ${formatMoney(trip.cost.total, trip.cost.currency)}`}</p>}
    </div>
  )
}

type PickRowProps = {
  pick: RestaurantPick
  travellers: number
  editable: boolean
  onMove?: (pick: RestaurantPick) => void
}

/** One restaurant pick: its meal when it has a day, its estimate, and a Move button for editors. */
function PickRow({ pick, travellers, editable, onMove }: PickRowProps) {
  return (
    <li className="pick-row">
      {pick.meal && <span className="meal-label">{mealLabel(pick.meal)}</span>}
      <span className="pick-name">{pick.name}</span>
      <span className="badge badge-neutral">{estimateLabel(pick, travellers)}</span>
      {editable && onMove && (
        <button className="btn btn-ghost" type="button" aria-label={`Move ${pick.name}`} onClick={() => onMove(pick)}>
          Move
        </button>
      )}
    </li>
  )
}

type ItineraryTabProps = {
  trip: Trip
  onRename: (day: Day, index: number) => void
  onAddReminder: (optionId?: string) => void
  onEditReminder: (reminder: Reminder) => void
  onAddActivity: (day: Day) => void
  onMoveActivity: (activity: Activity, date: string) => Promise<void>
  onRemoveActivity: (activity: Activity) => void
  onMoveRestaurant?: (pick: RestaurantPick) => void
}

/** One stack per day, in date order, each holding only that day's chosen options, activities and reminders. */
export function ItineraryTab({
  trip,
  onRename,
  onAddReminder,
  onEditReminder,
  onAddActivity,
  onMoveActivity,
  onRemoveActivity,
  onMoveRestaurant,
}: ItineraryTabProps) {
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveFailed, setMoveFailed] = useState(false)
  const days = trip.days ?? []
  const activities = trip.activities ?? []
  const options = trip.options ?? []
  const reminders = trip.reminders ?? []
  const restaurants = trip.restaurants ?? []
  const travellers = trip.traveller_count ?? 1
  const loosePicks = unscheduled(restaurants)
  const editable = trip.can_edit ?? trip.is_owner ?? false

  if (days.length === 0)
    return (
      <div className="empty-state">
        <h3>No days yet</h3>
        <p>
          {trip.is_owner
            ? 'Choose Edit trip and set a start and end date. Each date becomes a day.'
            : 'This trip has no dates yet.'}
        </p>
      </div>
    )

  return (
    <div className="stack stack-lg">
      <ChosenTransport trip={trip} />
      <ChosenStays trip={trip} editable={editable} />
      <section className="card stack stack-sm" aria-labelledby="itinerary-unscheduled">
        <div className="title-row">
          <h3 className="text-lg" id="itinerary-unscheduled">
            Unscheduled
          </h3>
          {editable && (
            <Link
              className="btn btn-secondary"
              to={`/trips/${encodeURIComponent(trip.id)}/restaurant-options/shortlist`}
            >
              <PlusIcon />
              Add restaurants
            </Link>
          )}
        </div>
        {loosePicks.length > 0 ? (
          <ul className="pick-list">
            {loosePicks.map((pick) => (
              <PickRow key={pick.id} pick={pick} travellers={travellers} editable={editable} onMove={onMoveRestaurant} />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No unscheduled restaurants. Anything you add without a day lands here.</p>
        )}
      </section>
      <div className="grid">
      {days.map((day, index) => {
        const chosen = options.filter((option) => option.date === day.date)
        const planned = activities.filter((activity) => activity.date === day.date)
        const meals = picksForDay(restaurants, day.date)
        const dated = reminders.filter((r) => r.date === day.date)
        // Notes not shown under an option of this day: trip notes, and activity notes dated on another day.
        const loose = dated.filter((r) => !chosen.some((option) => option.id === r.option_id))
        const headingId = `day-${day.date}`
        return (
          <section
            key={day.date}
            className="card stack stack-sm"
            aria-labelledby={headingId}
          >
            <div className="title-row">
              <h3 className="text-lg" id={headingId}>
                {formatDay(day.date)}{' '}
                <span className="text-sm text-muted">{weekday.format(asDate(day.date))}</span>
              </h3>
              {editable && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  aria-label={`Add activity to ${day.name}`}
                  onClick={() => onAddActivity(day)}
                >
                  <PlusIcon />
                  Add activity
                </button>
              )}
            </div>
            <p className="day-name">{day.name}</p>
            {trip.is_owner && (
              <div>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  aria-label={`Rename day ${index + 1}, ${day.name}`}
                  onClick={() => onRename(day, index)}
                >
                  <EditIcon />
                  Rename
                </button>
              </div>
            )}
            {chosen.length > 0 ? (
              <ul className="options">
                {chosen.map((option) => {
                  const own = dated.filter((r) => r.option_id === option.id)
                  return (
                    <li key={option.id} className="option">
                      <div className="option-head">
                        <div>
                          <div className="option-title">{option.title}</div>
                          <div className="text-sm text-muted">{option.category}</div>
                        </div>
                        <OptionPrice option={option} trip={trip} />
                        {editable && (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            aria-label={`Add reminder to ${option.title}`}
                            onClick={() => onAddReminder(option.id)}
                          >
                            <PlusIcon />
                            Add reminder
                          </button>
                        )}
                      </div>
                      {own.length > 0 && (
                        <div className="notes">
                          {own.map((r) => (
                            <Note key={r.id} reminder={r} editable={editable} onEdit={onEditReminder} />
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              planned.length === 0 &&
              meals.length === 0 && (
                <div className="empty-state">
                  <p>Nothing chosen for this day yet</p>
                  <p className="text-sm">
                    Options you choose for {formatDay(day.date)} will show up here.
                  </p>
                </div>
              )
            )}
            {meals.length > 0 && (
              <ul className="pick-list">
                {meals.map((pick) => (
                  <PickRow key={pick.id} pick={pick} travellers={travellers} editable={editable} onMove={onMoveRestaurant} />
                ))}
              </ul>
            )}
            {planned.length > 0 && (
              <ul className="options">
                {planned.map((activity) => (
                  <li key={activity.id} className="option option-head">
                    <div>
                      <div className="option-title">{activity.name}</div>
                      {activity.detail && <div className="text-sm text-muted">{activity.detail}</div>}
                    </div>
                    {editable && (
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          aria-label={`Move ${activity.name}`}
                          aria-expanded={movingId === activity.id}
                          onClick={() => {
                            setMoveFailed(false)
                            setMovingId(movingId === activity.id ? null : activity.id)
                          }}
                        >
                          Move
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          aria-label={`Remove ${activity.name}`}
                          onClick={() => onRemoveActivity(activity)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {editable && movingId === activity.id && (
                      <div className="move-to" role="group" aria-label={`Move ${activity.name} to`}>
                        <span className="note-for">Move to</span>
                        {days
                          .filter((other) => other.date !== day.date)
                          .map((other) => (
                            <button
                              key={other.date}
                              className="btn btn-secondary"
                              type="button"
                              onClick={async () => {
                                try {
                                  await onMoveActivity(activity, other.date)
                                  setMovingId(null)
                                } catch {
                                  setMoveFailed(true)
                                }
                              }}
                            >
                              {`${formatDay(other.date)}, ${other.name}`}
                            </button>
                          ))}
                        <button className="btn btn-ghost" type="button" onClick={() => setMovingId(null)}>
                          Cancel
                        </button>
                        {moveFailed && (
                          <p className="field-error" role="alert">
                            We couldn't move that activity. Try again.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {loose.map((r) => (
              <Note
                key={r.id}
                reminder={r}
                editable={editable}
                onEdit={onEditReminder}
                activity={options.find((o) => o.id === r.option_id)?.title}
              />
            ))}
          </section>
        )
      })}
      </div>
    </div>
  )
}
