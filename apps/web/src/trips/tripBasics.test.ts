import { validateTripBasics } from './tripBasics'

const today = '2026-10-24'
const ok = {
  destination: 'Lisbon',
  start: '2027-03-12',
  end: '2027-03-15',
  travellers: '2',
  budget: '1800',
  currency: 'EUR',
  name: 'Lisbon long weekend',
}

describe('validateTripBasics', () => {
  it('accepts complete, valid basics', () => {
    expect(validateTripBasics(ok, today)).toEqual({})
  })

  it('asks for each missing basic (AC9)', () => {
    expect(validateTripBasics({ ...ok, destination: ' ' }, today).destination).toBe('Choose a country and a place.')
    expect(validateTripBasics({ ...ok, start: '' }, today).dates).toBe('Enter a start and end date.')
    expect(validateTripBasics({ ...ok, end: '' }, today).dates).toBe('Enter a start and end date.')
    expect(validateTripBasics({ ...ok, travellers: '' }, today).travellers).toBe('Enter the number of travellers.')
    expect(validateTripBasics({ ...ok, budget: '' }, today).budget).toBe('Enter a budget.')
    expect(validateTripBasics({ ...ok, currency: '' }, today).budget).toBe('Choose a trip currency.')
    expect(validateTripBasics({ ...ok, budget: '', currency: '' }, today).budget).toBe(
      'Enter a budget and choose a currency.',
    )
    expect(validateTripBasics({ ...ok, name: '  ' }, today).name).toBe('Enter a trip name.')
  })

  it('refuses invalid dates (AC10)', () => {
    expect(validateTripBasics({ ...ok, start: '2026-10-01' }, today).dates).toBe(
      'Start date is in the past. Choose today or later.',
    )
    expect(validateTripBasics({ ...ok, start: today, end: '2026-10-26' }, today).dates).toBeUndefined()
    expect(validateTripBasics({ ...ok, start: '2027-03-05', end: '2027-03-01' }, today).dates).toMatch(
      /^End date is before the start date\. Choose a date on or after .*2027/,
    )
    expect(validateTripBasics({ ...ok, start: '2027-03-01', end: '2027-06-01' }, today).dates).toBe(
      'Trips can span up to 60 days. Shorten the dates.',
    )
    expect(validateTripBasics({ ...ok, start: '2027-03-01', end: '2027-04-29' }, today).dates).toBeUndefined()
  })

  it('refuses invalid travellers and budgets (AC10)', () => {
    const travellers = (n: string) => validateTripBasics({ ...ok, travellers: n }, today).travellers
    expect(travellers('0')).toBe('Enter at least one traveller, as a whole number.')
    expect(travellers('1.5')).toBe('Enter at least one traveller, as a whole number.')
    expect(travellers('21')).toBe('Trips are limited to 20 travellers. Enter 20 or fewer.')
    expect(travellers('20')).toBeUndefined()
    const budget = (n: string) => validateTripBasics({ ...ok, budget: n }, today).budget
    expect(budget('-5')).toBe('Enter a budget greater than 0.')
    expect(budget('0')).toBe('Enter a budget greater than 0.')
    expect(budget('abc')).toBe('Enter a budget greater than 0.')
  })
})
