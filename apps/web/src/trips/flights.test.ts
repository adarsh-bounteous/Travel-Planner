import { formatFare, formatLegDate, formatMinutes, formatRetrieved, formatStops } from './flights'

describe('flight helpers', () => {
  it('formats travel time', () => {
    expect(formatMinutes(55)).toBe('55 min')
    expect(formatMinutes(140)).toBe('2 h 20 min')
    expect(formatMinutes(120)).toBe('2 h')
  })

  it('formats stops', () => {
    expect(formatStops(0)).toBe('Nonstop')
    expect(formatStops(1)).toBe('1 stop')
    expect(formatStops(2)).toBe('2 stops')
  })

  it('formats a fare with cents and its currency', () => {
    expect(formatFare('54.00', 'EUR')).toMatch(/€54\.00|EUR\s?54\.00/)
  })

  it('formats the retrieval time and the leg date', () => {
    expect(formatRetrieved('2026-10-26T09:14:00Z')).toMatch(/26 Oct/)
    expect(formatLegDate('2027-11-18')).toBe('18 Nov')
  })
})
