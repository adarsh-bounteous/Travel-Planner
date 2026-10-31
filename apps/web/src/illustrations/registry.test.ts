import { describe, expect, it } from 'vitest'
import { PLACE_TYPE_LABELS, type PlaceType } from '../places/api'
import { illustrationLoaders, regionOfCountry, resolveIllustration } from './registry'

const PLACE_TYPES = Object.keys(PLACE_TYPE_LABELS) as PlaceType[]

describe('resolveIllustration', () => {
  it('uses the destination art when it exists', () => {
    expect(resolveIllustration({ destination: 'Lisbon', country: 'Portugal', placeType: 'landmark' })).toBe('destination/lisbon')
    expect(resolveIllustration({ destination: 'Tokyo', country: 'Japan', placeType: 'food' })).toBe('destination/tokyo')
  })

  it('falls back to the region art', () => {
    expect(resolveIllustration({ destination: 'Porto', country: 'Portugal', placeType: 'landmark' })).toBe('region/europe')
    expect(resolveIllustration({ destination: 'Kyoto', country: 'Japan', placeType: 'park' })).toBe('region/asia')
  })

  it('falls back to the place type art when the region has none', () => {
    expect(resolveIllustration({ destination: 'Mexico City', country: 'Mexico', placeType: 'museum' })).toBe('type/museum')
    expect(resolveIllustration({ destination: 'Marrakech', country: 'Morocco', placeType: 'shopping' })).toBe('type/shopping')
  })

  it('uses the place type art with no destination', () => {
    expect(resolveIllustration({ placeType: 'park' })).toBe('type/park')
  })

  it('maps seeded countries to regions', () => {
    expect(regionOfCountry('Japan')).toBe('asia')
    expect(regionOfCountry('Portugal')).toBe('europe')
    expect(regionOfCountry('Peru')).toBe('americas')
    expect(regionOfCountry('Morocco')).toBe('africa')
    expect(regionOfCountry('Atlantis')).toBeUndefined()
  })

  it('has a loader for every key the resolver can return', () => {
    for (const t of PLACE_TYPES) {
      expect(illustrationLoaders[resolveIllustration({ placeType: t })]).toBeTypeOf('function')
    }
    for (const ref of [
      { destination: 'Lisbon', placeType: 'landmark' },
      { destination: 'Tokyo', placeType: 'landmark' },
      { country: 'Portugal', placeType: 'landmark' },
      { country: 'India', placeType: 'landmark' },
    ] as const) {
      expect(illustrationLoaders[resolveIllustration(ref)]).toBeTypeOf('function')
    }
  })
})
