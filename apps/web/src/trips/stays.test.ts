import { describe, expect, it } from 'vitest'
import type { Stay } from './api'
import { formatRange, nights, sortStays, validateStay, warningFor } from './stays'

const lisbon: Stay = { id: 's1', place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05' }
const porto = (start_date: string, end_date: string): Stay => ({ id: 's2', place: 'Porto', start_date, end_date })

describe('warningFor', () => {
  it('flags overlapping dates', () => {
    expect(warningFor(porto('2027-01-04', '2027-01-08'), [lisbon])).toMatchObject({ kind: 'overlap', other: lisbon })
  })
  it('counts a shared day as an overlap', () => {
    expect(warningFor(porto('2027-01-05', '2027-01-08'), [lisbon])).toMatchObject({ kind: 'overlap' })
  })
  it('flags a gap after and before', () => {
    expect(warningFor(porto('2027-01-10', '2027-01-12'), [lisbon])).toMatchObject({
      kind: 'gap',
      from: '2027-01-06',
      to: '2027-01-09',
    })
    expect(warningFor(porto('2026-12-20', '2026-12-25'), [lisbon])).toMatchObject({
      kind: 'gap',
      from: '2026-12-26',
      to: '2026-12-31',
    })
  })
  it('does not flag back to back stays, a lone stay, or itself', () => {
    expect(warningFor(porto('2027-01-06', '2027-01-08'), [lisbon])).toBeNull()
    expect(warningFor(porto('2027-01-10', '2027-01-12'), [])).toBeNull()
    expect(warningFor(lisbon, [lisbon])).toBeNull()
  })
})

describe('validateStay', () => {
  const ok = { place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05' }
  it('accepts a complete stay', () => {
    expect(validateStay(ok)).toEqual({ startBad: false, endBad: false })
  })
  it('names each missing field', () => {
    expect(validateStay({ ...ok, place: '  ' }).place).toBe('Place is missing. Enter a place for this stay.')
    expect(validateStay({ ...ok, start_date: '' })).toMatchObject({
      dates: 'Start date is missing. Choose when the stay starts.',
      startBad: true,
      endBad: false,
    })
    expect(validateStay({ ...ok, end_date: '' })).toMatchObject({
      dates: 'End date is missing. Choose when the stay ends.',
      endBad: true,
    })
    expect(validateStay({ ...ok, start_date: '', end_date: '' }).dates).toBe(
      'Start date and end date are missing. Choose when the stay starts and ends.',
    )
  })
  it('refuses an end before the start', () => {
    expect(validateStay({ ...ok, start_date: '2027-01-08', end_date: '2027-01-04' })).toMatchObject({
      dates: 'The dates are invalid. The end date is before the start date.',
      startBad: true,
      endBad: true,
    })
  })
})

describe('formatting', () => {
  it('formats ranges, nights and order', () => {
    expect(formatRange('2027-01-01', '2027-01-05')).toBe('1 to 5 January')
    expect(formatRange('2027-01-30', '2027-02-02')).toBe('30 January to 2 February')
    expect(nights(lisbon)).toBe(4)
    expect(sortStays([porto('2027-01-10', '2027-01-12'), lisbon]).map((s) => s.id)).toEqual(['s1', 's2'])
  })
})
