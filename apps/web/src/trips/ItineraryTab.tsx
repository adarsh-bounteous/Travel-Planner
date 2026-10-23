import { EditIcon } from '../auth/icons'
import type { Day, Trip } from './api'

// Dates are plain calendar days, so format them in UTC: 3 March must stay 3 March everywhere.
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const formatDay = (iso: string) => dayMonth.format(asDate(iso))

type ItineraryTabProps = {
  trip: Trip
  onRename: (day: Day, index: number) => void
}

/** One stack per day, in date order, each holding only that day's chosen options. */
export function ItineraryTab({ trip, onRename }: ItineraryTabProps) {
  const days = trip.days ?? []
  const options = trip.options ?? []

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
                {chosen.map((option) => (
                  <li key={option.id} className="option">
                    <div className="option-title">{option.title}</div>
                    <div className="text-sm text-muted">{option.category}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <p>Nothing chosen for this day yet</p>
                <p className="text-sm">
                  Options you choose for {formatDay(day.date)} will show up here.
                </p>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
