import { stayQuery } from './api'
import type { StayCriteria } from './api'
import { DEFAULT_CRITERIA, describeCriteria } from './stayOptions'

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
