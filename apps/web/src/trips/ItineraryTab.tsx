import { BellIcon, CalendarIcon, EditIcon, PlusIcon } from '../auth/icons'
import type { Day, Reminder, Trip } from './api'

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

type ItineraryTabProps = {
  trip: Trip
  onRename: (day: Day, index: number) => void
  onAddReminder: (optionId?: string) => void
  onEditReminder: (reminder: Reminder) => void
}

/** One stack per day, in date order, each holding only that day's chosen options and reminders. */
export function ItineraryTab({ trip, onRename, onAddReminder, onEditReminder }: ItineraryTabProps) {
  const days = trip.days ?? []
  const options = trip.options ?? []
  const reminders = trip.reminders ?? []
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
    <div className="grid">
      {days.map((day, index) => {
        const chosen = options.filter((option) => option.date === day.date)
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
            <h3 className="text-lg" id={headingId}>
              {formatDay(day.date)}{' '}
              <span className="text-sm text-muted">{weekday.format(asDate(day.date))}</span>
            </h3>
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
              <div className="empty-state">
                <p>Nothing chosen for this day yet</p>
                <p className="text-sm">
                  Options you choose for {formatDay(day.date)} will show up here.
                </p>
              </div>
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
  )
}
