import { formatMoney, formatRate } from './money'

describe('formatMoney', () => {
  it('always shows the currency code next to the amount', () => {
    expect(formatMoney(300, 'EUR')).toMatch(/EUR/)
    expect(formatMoney(300, 'EUR')).toMatch(/300\.00/)
    expect(formatMoney(120.5, 'USD')).toMatch(/USD/)
  })
})

describe('formatRate', () => {
  it('keeps at most four decimals', () => {
    expect(formatRate(0.92)).toBe('0.92')
    expect(formatRate(1.234567)).toBe('1.2346')
  })
})
