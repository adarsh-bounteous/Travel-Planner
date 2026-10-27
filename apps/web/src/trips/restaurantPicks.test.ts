import type { RestaurantPick } from './api'
import { estimateLabel, pickEstimate, picksForDay, unscheduled } from './restaurantPicks'

const pick = (overrides: Partial<RestaurantPick> = {}): RestaurantPick => ({
  id: 'p1',
  name: 'Casa Lima',
  city: 'Lisbon',
  cuisine: 'Portuguese',
  typical_price: '19',
  currency: 'EUR',
  url: null,
  date: null,
  meal: null,
  ...overrides,
})

describe('pickEstimate', () => {
  it('is the price per person times the group size (AC5)', () => {
    expect(pickEstimate(pick(), 3)).toBe(57)
  })
  it('is null when the price is unknown (AC9)', () => {
    expect(pickEstimate(pick({ typical_price: null }), 3)).toBeNull()
  })
})

describe('estimateLabel', () => {
  it('labels the estimate with the currency code (AC5)', () => {
    expect(estimateLabel(pick({ typical_price: '19' }), 3)).toBe('Estimate 57 EUR')
    expect(estimateLabel(pick(), 2)).toBe('Estimate 38 EUR')
  })
  it('says the estimate is unavailable without a price (AC9)', () => {
    expect(estimateLabel(pick({ typical_price: null }), 2)).toBe('Estimate unavailable')
  })
})

describe('grouping', () => {
  const picks = [
    pick({ id: 'a', date: '2026-05-01', meal: 'dinner' }),
    pick({ id: 'b', date: '2026-05-01', meal: 'breakfast' }),
    pick({ id: 'c', date: '2026-05-02', meal: 'lunch' }),
    pick({ id: 'd' }),
  ]
  it('lists a day in meal order, and only that day (AC3, AC4)', () => {
    expect(picksForDay(picks, '2026-05-01').map((p) => p.id)).toEqual(['b', 'a'])
    expect(picksForDay(picks, '2026-05-02').map((p) => p.id)).toEqual(['c'])
  })
  it('lists the picks without a day (AC2)', () => {
    expect(unscheduled(picks).map((p) => p.id)).toEqual(['d'])
  })
})
