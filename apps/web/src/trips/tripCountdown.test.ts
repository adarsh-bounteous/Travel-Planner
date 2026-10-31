import { countdownLabel, daysUntil, greetingFor, soonestUpcomingTripId } from './tripCountdown'

const today = new Date(2027, 0, 5, 15, 0)

describe('greetingFor', () => {
  it('follows the device clock (AC8)', () => {
    expect(greetingFor(new Date(2027, 0, 5, 9, 0))).toBe('morning')
    expect(greetingFor(new Date(2027, 0, 5, 12, 0))).toBe('afternoon')
    expect(greetingFor(new Date(2027, 0, 5, 17, 59))).toBe('afternoon')
    expect(greetingFor(new Date(2027, 0, 5, 18, 0))).toBe('evening')
    expect(greetingFor(new Date(2027, 0, 5, 0, 30))).toBe('morning')
  })
})

describe('daysUntil and countdownLabel', () => {
  it('counts whole days as plain text (AC2)', () => {
    expect(daysUntil('2027-01-19', today)).toBe(14)
    expect(countdownLabel(14)).toBe('Starts in 14 days')
    expect(countdownLabel(1)).toBe('Starts in 1 day')
  })

  it('is not shifted by daylight saving', () => {
    expect(daysUntil('2027-03-29', new Date(2027, 2, 26, 23, 59))).toBe(3)
  })
})

describe('soonestUpcomingTripId', () => {
  const lisbon = { id: 'lisbon', start_date: '2027-01-19' }
  const kyoto = { id: 'kyoto', start_date: '2027-02-06' }

  it('picks only the soonest future trip, in either order (AC3)', () => {
    expect(soonestUpcomingTripId([kyoto, lisbon], today)).toBe('lisbon')
    expect(soonestUpcomingTripId([lisbon, kyoto], today)).toBe('lisbon')
  })

  it('ignores underway trips (AC4)', () => {
    expect(soonestUpcomingTripId([{ id: 'a', start_date: '2027-01-03' }], today)).toBeNull()
  })

  it('ignores undated trips and still counts a dated one (AC5)', () => {
    const undated = [{ id: 'a', start_date: null }, { id: 'b' }]
    expect(soonestUpcomingTripId(undated, today)).toBeNull()
    expect(soonestUpcomingTripId([...undated, lisbon], today)).toBe('lisbon')
  })

  it('ignores a trip starting today, even at 23:59 (AC9)', () => {
    const late = new Date(2027, 0, 5, 23, 59)
    expect(soonestUpcomingTripId([{ id: 'a', start_date: '2027-01-05' }], late)).toBeNull()
  })

  it('gives the count to the first of two trips starting the same day', () => {
    const twin = { id: 'twin', start_date: '2027-01-19' }
    expect(soonestUpcomingTripId([lisbon, twin], today)).toBe('lisbon')
  })
})
