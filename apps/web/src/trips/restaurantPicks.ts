import type { Day, Meal, RestaurantPick } from './api'
import { formatMoney } from './TripTotalCard'

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
]

export const mealLabel = (meal: Meal) => MEALS.find((m) => m.id === meal)?.label ?? meal

type Priced = Pick<RestaurantPick, 'typical_price' | 'currency'>

const mealOrder = (pick: RestaurantPick) => MEALS.findIndex((m) => m.id === pick.meal)

/** The group estimate: typical price per person times the group; null when the price is unknown. */
export function pickEstimate(pick: Priced, travellers: number): number | null {
  return pick.typical_price === null ? null : Number(pick.typical_price) * travellers
}

export function estimateLabel(pick: Priced, travellers: number): string {
  const estimate = pickEstimate(pick, travellers)
  return estimate === null ? 'Estimate unavailable' : `Estimate ${formatMoney(estimate, pick.currency)}`
}

/** The picks on one day, breakfast first. */
export const picksForDay = (picks: RestaurantPick[], date: string) =>
  picks.filter((p) => p.date === date).sort((a, b) => mealOrder(a) - mealOrder(b))

export const unscheduled = (picks: RestaurantPick[]) => picks.filter((p) => p.date === null)

/** Where a pick sits, in the trip's own day names: "Day 2, Dinner", or "Unscheduled". */
export function dayMealLabel(pick: Pick<RestaurantPick, 'date' | 'meal'>, days: Day[]): string {
  if (pick.date === null || pick.meal === null) return 'Unscheduled'
  return `${days.find((d) => d.date === pick.date)?.name ?? pick.date}, ${mealLabel(pick.meal)}`
}

/** The day a new pick starts on: the first day, or '' (Unscheduled) when the trip has no days. */
export const defaultDay = (days: Day[]) => days[0]?.date ?? ''
