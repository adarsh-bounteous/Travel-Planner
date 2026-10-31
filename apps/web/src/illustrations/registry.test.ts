import { describe, expect, it } from 'vitest'
import { PLACE_TYPE_LABELS, type PlaceType } from '../places/api'
import {
  illustrationAlt,
  illustrationLoaders,
  illustrationRefOfLabel,
  illustrationRefOfTrip,
  regionOfCountry,
  resolveIllustration,
} from './registry'

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

  it('falls back to the generic art when nothing matches (AC13)', () => {
    expect(resolveIllustration({ destination: 'Reykjavik' })).toBe('generic/generic')
    expect(resolveIllustration({})).toBe('generic/generic')
    expect(illustrationLoaders['generic/generic']).toBeTypeOf('function')
  })

  it('describes destination art by name and everything else neutrally (AC11)', () => {
    expect(illustrationAlt({ destination: 'Lisbon' }, 'Lisbon')).toBe('Illustration of Lisbon')
    expect(illustrationAlt({ placeType: 'food' })).toBe('Neutral illustration of hills and a sun')
    expect(illustrationAlt({})).toBe('Neutral illustration of hills and a sun')
  })

  it('reads a "Country, Place" label in either order (AC5)', () => {
    expect(resolveIllustration(illustrationRefOfLabel('Portugal, Lisbon'))).toBe('destination/lisbon')
    expect(resolveIllustration(illustrationRefOfLabel('Lisbon, Portugal'))).toBe('destination/lisbon')
    expect(resolveIllustration(illustrationRefOfLabel('Portugal, Porto'))).toBe('region/europe')
    expect(resolveIllustration(illustrationRefOfLabel(null))).toBe('generic/generic')
  })

  it('reads a trip by its place and country, else by its destination label (AC1, AC2)', () => {
    expect(resolveIllustration(illustrationRefOfTrip({ place: 'Lisbon', country: 'Portugal' }))).toBe('destination/lisbon')
    expect(resolveIllustration(illustrationRefOfTrip({ destination: 'Lisbon, Portugal' }))).toBe('destination/lisbon')
    expect(resolveIllustration(illustrationRefOfTrip({ destination: 'Norway' }))).toBe('generic/generic')
    expect(resolveIllustration(illustrationRefOfTrip({}))).toBe('generic/generic')
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
