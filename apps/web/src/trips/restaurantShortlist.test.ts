import type { ShortlistEntry } from './api'
import { canCompare, shortlistReason } from './restaurantShortlist'

const entry = (over: Partial<ShortlistEntry> = {}): ShortlistEntry => ({
  rank: 1,
  restaurant: {
    name: 'Casa Lima',
    city: 'Lisbon',
    cuisine: 'Portuguese',
    dining_style: 'Casual',
    price_level: 2,
    typical_price: '19',
    currency: 'EUR',
    suits: [],
    url: null,
  },
  fits_budget: true,
  preferences_met: ['Portuguese cuisine'],
  preferences_total: 2,
  ...over,
})

describe('shortlistReason', () => {
  it('names the price, the budget and the preferences met', () => {
    expect(shortlistReason(entry(), '25', 'EUR')).toBe(
      'Typically €19 per person, within your €25 budget. Meets 1 of 2 preferences: Portuguese cuisine.',
    )
  })

  it('says over budget and that no preference is met', () => {
    expect(shortlistReason(entry({ fits_budget: false, preferences_met: [] }), '10', 'EUR')).toBe(
      'Typically €19 per person, over your €10 budget. Meets none of your other preferences.',
    )
  })

  it('leaves out the budget and the preferences when there are none', () => {
    expect(shortlistReason(entry({ preferences_met: [], preferences_total: 0 }), null, null)).toBe(
      'Typically €19 per person.',
    )
  })
})

describe('canCompare', () => {
  it('needs at least two entries', () => {
    expect(canCompare([])).toBe(false)
    expect(canCompare([entry()])).toBe(false)
    expect(canCompare([entry(), entry()])).toBe(true)
  })
})
