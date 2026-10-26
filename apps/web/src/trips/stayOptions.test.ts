import { stayQuery } from './api'
import type { Amenity, ShortlistStay, StayCriteria } from './api'
import { DEFAULT_CRITERIA, comparisonMarks, criteriaFromQuery, describeCriteria } from './stayOptions'

describe('stayQuery', () => {
  it('sends only property type and rooms for default criteria (AC5)', () => {
    expect(stayQuery(DEFAULT_CRITERIA)).toBe('property_type=hotel&rooms=1')
  })

  it('adds each filter that is turned on', () => {
    const c: StayCriteria = {
      property_type: 'homestay',
      rooms: 2,
      max_price: 100,
      location: ' Baixa ',
      amenities: ['pool', 'wifi'],
      stars: [4, 5],
      widen: true,
    }
    expect(stayQuery(c)).toBe(
      'property_type=homestay&rooms=2&max_price=100&location=Baixa&amenities=pool&amenities=wifi&stars=4&stars=5&widen=true',
    )
  })
})

describe('describeCriteria', () => {
  it('names what was searched', () => {
    const c: StayCriteria = { ...DEFAULT_CRITERIA, amenities: ['pool'], stars: [5] }
    expect(describeCriteria(c, 'Lisbon')).toBe('Hotel, 1 room, pool, 5 stars in Lisbon.')
  })

  it('names budget, location, Wi-Fi and a widened search', () => {
    const c: StayCriteria = {
      ...DEFAULT_CRITERIA,
      rooms: 2,
      max_price: 100,
      location: 'Baixa',
      amenities: ['wifi'],
      stars: [3, 4],
      widen: true,
    }
    expect(describeCriteria(c, 'Lisbon')).toBe(
      'Hotel, 2 rooms, up to €100 a night, near Baixa, free Wi-Fi, 3 stars or 4 stars in Lisbon and nearby.',
    )
  })
})

const stayRow = (id: string, total: string, fit: number, amenities: number): ShortlistStay => ({
  rank: 1,
  property: {
    id,
    name: id,
    property_type: 'hotel',
    rooms: 1,
    stars: 3,
    area: 'Baixa',
    amenities: ['wifi', 'breakfast', 'parking', 'pool', 'ac'].slice(0, amenities) as Amenity[],
    nearby: false,
    offers: [],
  },
  total,
  currency: 'EUR',
  fits_budget: true,
  over_budget_by: '0',
  fit,
  reason: 'Best overall',
  why: 'x',
})

describe('comparisonMarks', () => {
  it('marks the lowest total, best fit and most offers (AC4)', () => {
    const stays = [
      stayRow('hotel-alfama-terrace-alfama', '472', 92, 3),
      stayRow('pensao-rossio-baixa', '248', 68, 1),
      stayRow('baixa-grand-hotel-baixa', '836', 88, 5),
    ]
    expect(comparisonMarks(stays)).toEqual({
      lowestPrice: ['pensao-rossio-baixa'],
      bestFit: ['hotel-alfama-terrace-alfama'],
      mostOffers: ['baixa-grand-hotel-baixa'],
    })
  })

  it('marks every tied stay', () => {
    const stays = [stayRow('a', '100', 80, 2), stayRow('b', '100', 80, 2)]
    expect(comparisonMarks(stays)).toEqual({ lowestPrice: ['a', 'b'], bestFit: ['a', 'b'], mostOffers: ['a', 'b'] })
  })
})

describe('criteriaFromQuery', () => {
  it('round-trips what stayQuery writes', () => {
    const c: StayCriteria = { ...DEFAULT_CRITERIA, max_price: 100, amenities: ['pool'], stars: [4, 5], widen: true }
    expect(criteriaFromQuery(new URLSearchParams(stayQuery(c)))).toEqual(c)
    expect(criteriaFromQuery(new URLSearchParams(''))).toEqual(DEFAULT_CRITERIA)
  })
})
