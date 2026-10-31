import type { Trip } from './api'

export type Period = 'morning' | 'afternoon' | 'evening'

/** Greeting for the device clock: before 12:00 morning, 12:00-17:59 afternoon, then evening. */
export function greetingFor(now: Date): Period {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  return hour < 18 ? 'afternoon' : 'evening'
}

// Date-only strings are read as local calendar days; `Date.UTC` on the y/m/d parts keeps DST out of the maths.
function dayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) / 86_400_000
}

/** Whole calendar days from today's local date to `startDate` (negative once it has started). */
export function daysUntil(startDate: string, today: Date): number {
  const [year, month, day] = startDate.split('-').map(Number)
  return (
    dayNumber(year, month - 1, day) -
    dayNumber(today.getFullYear(), today.getMonth(), today.getDate())
  )
}

/** The one trip that starts strictly after today and sooner than any other, else null. */
export function soonestUpcomingTripId(
  trips: Pick<Trip, 'id' | 'start_date'>[],
  today: Date,
): string | null {
  let soonestId: string | null = null
  let soonestDays = Infinity
  for (const trip of trips) {
    if (!trip.start_date) continue
    const days = daysUntil(trip.start_date, today)
    if (days > 0 && days < soonestDays) {
      soonestId = trip.id
      soonestDays = days
    }
  }
  return soonestId
}

export function countdownLabel(days: number): string {
  return `Starts in ${days} ${days === 1 ? 'day' : 'days'}`
}
