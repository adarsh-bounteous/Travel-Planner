import type { ShortlistEntry } from './api'
import { formatMoney } from './stayOptions'

/** Two or more matching restaurants are needed for a side-by-side comparison. */
export const canCompare = (entries: ShortlistEntry[]) => entries.length >= 2

/** The one-sentence reason for an entry: its price against the budget, then the preferences it meets. */
export function shortlistReason(entry: ShortlistEntry, budget: string | null, currency: string | null) {
  const { restaurant, fits_budget, preferences_met, preferences_total } = entry
  const price = formatMoney(restaurant.typical_price, restaurant.currency)
  const against =
    budget !== null && currency
      ? `, ${fits_budget ? 'within' : 'over'} your ${formatMoney(budget, currency)} budget`
      : ''
  const prefs =
    preferences_total === 0
      ? ''
      : preferences_met.length > 0
        ? ` Meets ${preferences_met.length} of ${preferences_total} preferences: ${preferences_met.join(', ')}.`
        : ' Meets none of your other preferences.'
  return `Typically ${price} per person${against}.${prefs}`
}
