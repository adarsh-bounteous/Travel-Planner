import { convertAmount, formatMoney, formatRate, formatTripDates, parseAmount } from './helperFormat'

const local = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

describe('helperFormat', () => {
  it('puts the currency code before the number', () => {
    expect(formatMoney(1000, 'JPY')).toBe('JPY 1,000')
    expect(formatMoney(6.1, 'EUR')).toBe('EUR 6.10')
    expect(formatRate(0.0061, 'JPY', 'EUR')).toBe('JPY 1 = EUR 0.0061')
  })

  it('converts both ways at the rate', () => {
    expect(convertAmount(1000, 0.0061, 'toHome')).toBeCloseTo(6.1)
    expect(convertAmount(6.1, 0.0061, 'toDestination')).toBeCloseTo(1000)
  })

  it('parses amounts with thousands separators', () => {
    expect(parseAmount('2,500')).toBe(2500)
    expect(parseAmount('6.10')).toBe(6.1)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })

  it('shows trip dates in the local format', () => {
    expect(formatTripDates('2026-11-03', '2026-11-09')).toBe(`${local('2026-11-03')} – ${local('2026-11-09')}`)
    expect(formatTripDates(null, null)).toBe('')
  })
})
