import {
  editDistance,
  evaluateDestination,
  formatDestination,
  parseDestination,
} from './destinationMatch'
import type { Catalogue } from './destinationMatch'

const CATALOGUE: Catalogue = [
  { name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] },
  { name: 'Portugal', places: ['Lisbon', 'Porto', 'Lagos'] },
]

describe('editDistance', () => {
  it('counts edits, ignoring case and accents', () => {
    expect(editDistance('Lisbon', 'lisbon')).toBe(0)
    expect(editDistance('Lisbon', 'Lisbn')).toBe(1)
    expect(editDistance('Lisbon', 'Lsb')).toBe(3)
    expect(editDistance('São', 'Sao')).toBe(0)
  })
})

describe('evaluateDestination', () => {
  it('treats blank text as empty', () => {
    expect(evaluateDestination('  ', CATALOGUE)).toEqual({ kind: 'empty' })
  })

  it('selects an exact place or country', () => {
    expect(evaluateDestination('kyoto', CATALOGUE)).toEqual({
      kind: 'place',
      choice: { country: 'Japan', place: 'Kyoto' },
    })
    expect(evaluateDestination('Portugal', CATALOGUE)).toEqual({
      kind: 'country',
      country: 'Portugal',
    })
  })

  it('suggests one place within 2 edits', () => {
    expect(evaluateDestination('Lisbn', CATALOGUE)).toEqual({
      kind: 'near',
      choice: { country: 'Portugal', place: 'Lisbon' },
    })
    expect(evaluateDestination('Lsbn', CATALOGUE)).toMatchObject({ kind: 'near' })
  })

  it('picks the lowest distance, then catalogue order', () => {
    expect(evaluateDestination('Porta', CATALOGUE)).toMatchObject({
      choice: { place: 'Porto' },
    })
    expect(evaluateDestination('Tokya', CATALOGUE)).toMatchObject({ choice: { place: 'Tokyo' } })
    const ties: Catalogue = [{ name: 'A', places: ['Cat', 'Bat'] }]
    expect(evaluateDestination('Hat', ties)).toMatchObject({ choice: { place: 'Cat' } })
  })

  it('offers nothing 3 or more edits away', () => {
    expect(evaluateDestination('Lsb', CATALOGUE)).toEqual({ kind: 'none' })
    expect(evaluateDestination('Atlantis', CATALOGUE)).toEqual({ kind: 'none' })
  })
})

describe('stored format', () => {
  it('formats and parses Place, Country', () => {
    expect(formatDestination({ country: 'Japan', place: 'Kyoto' })).toBe('Kyoto, Japan')
    expect(parseDestination('Lisbon, Portugal', CATALOGUE)).toEqual({
      country: 'Portugal',
      place: 'Lisbon',
    })
  })

  it('parses legacy free text to null', () => {
    expect(parseDestination('Norway', CATALOGUE)).toBeNull()
    expect(parseDestination('Lisbon', CATALOGUE)).toBeNull()
    expect(parseDestination(null, CATALOGUE)).toBeNull()
  })
})

describe('agreement with the server matcher (services/api test_destination_match.py)', () => {
  it('resolves the same cases', () => {
    expect(parseDestination('Lisbon, Portugal', CATALOGUE)).toEqual({ country: 'Portugal', place: 'Lisbon' })
    expect(evaluateDestination('Lisbon', CATALOGUE).kind).toBe('place')
    expect(evaluateDestination('Lisbn', CATALOGUE).kind).toBe('near')
    expect(evaluateDestination('Portugal', CATALOGUE).kind).toBe('country')
  })
})
