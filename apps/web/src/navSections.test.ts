import { mainSectionFor } from './navSections'

describe('mainSectionFor', () => {
  it('maps Trips screens to trips (AC9)', () => {
    expect(mainSectionFor('/')).toBe('trips')
    expect(mainSectionFor('/trips/abc')).toBe('trips')
  })

  it('maps Explore screens to explore (AC9)', () => {
    expect(mainSectionFor('/explore')).toBe('explore')
    expect(mainSectionFor('/destinations')).toBe('explore')
    expect(mainSectionFor('/explore/travel')).toBe('explore')
    expect(mainSectionFor('/explore/travel/booking')).toBe('explore')
  })

  it('maps screens under no main section to null (AC8)', () => {
    expect(mainSectionFor('/saved')).toBeNull()
    expect(mainSectionFor('/account')).toBeNull()
    expect(mainSectionFor('/profile')).toBeNull()
  })
})
