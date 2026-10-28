import type { Stay, StayInput } from './api'

export type StayWarning =
  | { kind: 'overlap'; other: Stay }
  | { kind: 'gap'; before: Stay; after: Stay; from: string; to: string }

export type StayErrors = { place?: string; dates?: string; startBad: boolean; endBad: boolean }

const DAY_MS = 86_400_000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY_MS)
const shift = (iso: string, days: number) => new Date(toMs(iso) + days * DAY_MS).toISOString().slice(0, 10)

export function validateStay(input: StayInput): StayErrors {
  const noStart = input.start_date === ''
  const noEnd = input.end_date === ''
  const errors: StayErrors = { startBad: noStart, endBad: noEnd }
  if (input.place.trim() === '') errors.place = 'Place is missing. Enter a place for this stay.'
  if (noStart && noEnd) errors.dates = 'Start date and end date are missing. Choose when the stay starts and ends.'
  else if (noStart) errors.dates = 'Start date is missing. Choose when the stay starts.'
  else if (noEnd) errors.dates = 'End date is missing. Choose when the stay ends.'
  else if (input.end_date < input.start_date) {
    errors.dates = 'The dates are invalid. The end date is before the start date.'
    errors.startBad = true
    errors.endBad = true
  }
  return errors
}

export const hasErrors = (errors: StayErrors) => Boolean(errors.place || errors.dates)

/** The first problem with a stay among the others: a shared day overlaps; more than a day apart is a gap. */
export function warningFor(stay: Stay, others: Stay[]): StayWarning | null {
  const rest = others.filter((o) => o.id !== stay.id)
  const other = rest.find((o) => stay.start_date <= o.end_date && stay.end_date >= o.start_date)
  if (other) return { kind: 'overlap', other }
  const before = rest
    .filter((o) => o.end_date < stay.start_date)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
  const after = rest
    .filter((o) => o.start_date > stay.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  if (before && daysBetween(before.end_date, stay.start_date) > 1)
    return { kind: 'gap', before, after: stay, from: shift(before.end_date, 1), to: shift(stay.start_date, -1) }
  if (after && daysBetween(stay.end_date, after.start_date) > 1)
    return { kind: 'gap', before: stay, after, from: shift(stay.end_date, 1), to: shift(after.start_date, -1) }
  return null
}

export const sortStays = (stays: Stay[]) =>
  [...stays].sort((a, b) => a.start_date.localeCompare(b.start_date))

const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/** Why a flagged stay is outside the trip: no shared day, or how far it runs past the nearer edge. */
export function outsideReason(stay: Stay, tripStart: string, tripEnd: string): string {
  if (stay.end_date < tripStart || stay.start_date > tripEnd) return 'Entirely outside your trip.'
  if (stay.start_date < tripStart) return `Starts ${plural(daysBetween(stay.start_date, tripStart))} before your trip.`
  return `Ends ${plural(daysBetween(tripEnd, stay.end_date))} after your trip.`
}

export const nights =(stay: Stay) => daysBetween(stay.start_date, stay.end_date)

const part = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`)
  return {
    day: date.getUTCDate(),
    month: date.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }),
  }
}

export function formatRange(start: string, end: string) {
  const a = part(start)
  const b = part(end)
  return a.month === b.month ? `${a.day} to ${b.day} ${b.month}` : `${a.day} ${a.month} to ${b.day} ${b.month}`
}
