/** The currencies a trip can be planned in: the long name for the select, the plural for the note. */
export const TRIP_CURRENCIES: Record<string, { name: string; plural: string }> = {
  EUR: { name: 'Euro', plural: 'euros' },
  GBP: { name: 'Pound sterling', plural: 'pounds sterling' },
  USD: { name: 'US dollar', plural: 'US dollars' },
  JPY: { name: 'Japanese yen', plural: 'Japanese yen' },
  AUD: { name: 'Australian dollar', plural: 'Australian dollars' },
}

export const MAX_TRAVELLERS = 20
export const MAX_TRIP_DAYS = 60 // the same cap the API enforces on a trip's dates

/** What the set-up form holds: every field as the traveller typed it. */
export type TripBasics = {
  destination: string
  start: string
  end: string
  travellers: string
  budget: string
  currency: string
  name: string
}

export type TripBasicsErrors = Partial<
  Record<'destination' | 'dates' | 'travellers' | 'budget' | 'name', string>
>

const DAY_MS = 24 * 60 * 60 * 1000
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS

const readable = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })

function datesError({ start, end }: TripBasics, today: string) {
  if (!start || !end) return 'Enter a start and end date.'
  if (start < today) return 'Start date is in the past. Choose today or later.'
  if (end < start) return `End date is before the start date. Choose a date on or after ${readable(start)}.`
  if (dayNumber(end) - dayNumber(start) + 1 > MAX_TRIP_DAYS)
    return `Trips can span up to ${MAX_TRIP_DAYS} days. Shorten the dates.`
}

function travellersError(text: string) {
  if (text === '') return 'Enter the number of travellers.'
  if (!/^\d+$/.test(text) || Number(text) < 1) return 'Enter at least one traveller, as a whole number.'
  if (Number(text) > MAX_TRAVELLERS)
    return `Trips are limited to ${MAX_TRAVELLERS} travellers. Enter ${MAX_TRAVELLERS} or fewer.`
}

function budgetError(budget: string, currency: string) {
  if (budget === '' && !currency) return 'Enter a budget and choose a currency.'
  if (budget === '') return 'Enter a budget.'
  if (!(Number(budget) > 0)) return 'Enter a budget greater than 0.'
  if (!currency) return 'Choose a trip currency.'
}

/** What stops Finish, keyed by field; empty when the basics are complete. `today` is an ISO date. */
export function validateTripBasics(values: TripBasics, today: string): TripBasicsErrors {
  const errors: TripBasicsErrors = {
    destination: values.destination.trim() ? undefined : 'Enter a destination, like Lisbon.',
    dates: datesError(values, today),
    travellers: travellersError(values.travellers.trim()),
    budget: budgetError(values.budget.trim(), values.currency),
    name: values.name.trim() ? undefined : 'Enter a trip name.',
  }
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as TripBasicsErrors
}
