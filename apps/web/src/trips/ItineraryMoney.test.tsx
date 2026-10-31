import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import type { Booking, ItineraryMoney as Money } from './api'
import { ItineraryMoney } from './ItineraryMoney'

const tripDates = { start: '2026-11-14', end: '2026-11-16' }
const STANDARD = [
  'Flights to and from the destination',
  'Travel insurance',
  'Personal expenses',
  'Tips and gratuities',
  'Visas and entry fees',
]

const stay: Booking = {
  name: 'Alfama Loft',
  kind: 'stay',
  provider: 'Web',
  start_date: '2026-11-14',
  end_date: '2026-11-16',
  price: '300.00',
  currency: 'EUR',
  status: 'Chosen',
  link_url: 'https://stays.example.com/x',
  outside_trip_dates: false,
  add_url: '/trips/t1/stays/s1/options',
}

const money = (over: Partial<Money> = {}): Money => ({
  bookings: [stay],
  included: [{ name: 'Alfama Loft', amount: '300.00', currency: 'EUR' }],
  not_included: [],
  standard_exclusions: STANDARD,
  cost: {
    currency: 'EUR',
    subtotals: [{ currency: 'EUR', amount: '300.00' }],
    total: '300.00',
    conversions: [],
    unconvertible_count: 0,
    estimates_note: 'Prices are estimates and may change before you pay.',
  },
  ...over,
})

const show = (m: Money) =>
  render(
    <MemoryRouter>
      <ItineraryMoney money={m} tripDates={tripDates} />
    </MemoryRouter>,
  )

const section = (name: string) => screen.getByRole('region', { name })

describe('ItineraryMoney', () => {
  it('lists each chosen item in the bookings table with provider, dates, price, status and link (AC1, AC2)', () => {
    show(money())
    const table = screen.getByRole('table', { name: /bookings/i })
    const row = within(table).getByRole('row', { name: /Alfama Loft/ })
    expect(within(row).getByText(/EUR/)).toBeInTheDocument()
    expect(within(row).getByText('Web')).toBeInTheDocument()
    expect(within(row).getByText('Chosen')).toBeInTheDocument()
    expect(within(row).getByText(/14/)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: /Open Web for Alfama Loft/ })).toHaveAttribute(
      'href',
      'https://stays.example.com/x',
    )
  })

  it('shows a row per stay (AC18)', () => {
    show(money({ bookings: [stay, { ...stay, name: 'Porto Hotel' }] }))
    const table = screen.getByRole('table', { name: /bookings/i })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })

  it('lists priced chosen items under Included (AC3) and not unchosen ones (AC4)', () => {
    show(money({ not_included: [{ name: 'Sintra', reason: 'unchosen', add_url: '/trips/t1/activity-options' }] }))
    expect(within(section('Included')).getByText('Alfama Loft')).toBeInTheDocument()
    expect(within(section('Included')).queryByText('Sintra')).not.toBeInTheDocument()
  })

  it('lists an unchosen item under Not included with a link to add it, before the standard exclusions (AC5, AC6, AC12)', () => {
    show(money({ not_included: [{ name: 'Sintra', reason: 'unchosen', add_url: '/trips/t1/activity-options' }] }))
    const notIncluded = section('Not included')
    expect(within(notIncluded).getByText('Sintra')).toBeInTheDocument()
    const link = within(notIncluded).getByRole('link', { name: /Add to plan/ })
    expect(link).toHaveAttribute('href', '/trips/t1/activity-options')
    const list = screen.getByRole('list', { name: /usually not covered/i })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(STANDARD)
    expect(link.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('marks an unpriced chosen item and offers to add a price (AC11)', () => {
    show(
      money({
        bookings: [{ ...stay, price: null, currency: null }],
        included: [],
        not_included: [{ name: 'Alfama Loft', reason: 'unpriced', add_url: '/trips/t1/stays/s1/options' }],
      }),
    )
    const notIncluded = section('Not included')
    expect(within(notIncluded).getByText('Unpriced')).toBeInTheDocument()
    expect(within(notIncluded).getByRole('link', { name: /Add price/ })).toHaveAttribute(
      'href',
      '/trips/t1/stays/s1/options',
    )
  })

  it('shows each currency total and the trip total with codes (AC7)', () => {
    show(
      money({
        cost: {
          ...money().cost,
          currency: 'USD',
          subtotals: [
            { currency: 'EUR', amount: '300.00' },
            { currency: 'USD', amount: '120.00' },
          ],
          total: '444.00',
        },
      }),
    )
    const cost = section('Cost summary')
    expect(within(cost).getAllByText(/EUR/).length).toBeGreaterThan(0)
    expect(within(cost).getAllByText(/USD/).length).toBeGreaterThanOrEqual(2)
  })

  it('shows no conversion note when nothing was converted (AC8)', () => {
    show(money())
    expect(screen.queryByText(/converted to/)).not.toBeInTheDocument()
  })

  it('shows the conversion note with the rate date (AC9, AC10)', () => {
    show(
      money({
        cost: {
          ...money().cost,
          currency: 'USD',
          conversions: [{ currency: 'EUR', rate: '1.08', rate_date: '2026-10-28' }],
        },
      }),
    )
    expect(screen.getByText(/EUR converted to USD at 1 EUR = 1.08 USD, rate from/)).toHaveTextContent('2026')
  })

  it('shows the estimates note (AC14)', () => {
    show(money())
    expect(screen.getByText('Prices are estimates and may change before you pay.')).toBeInTheDocument()
  })

  it('flags a stay outside the trip dates with an alert and a row badge (AC15, AC16)', () => {
    show(money({ bookings: [{ ...stay, start_date: '2026-11-15', end_date: '2026-11-20', outside_trip_dates: true }] }))
    expect(screen.getByRole('alert')).toHaveTextContent('A booked stay falls outside the trip dates')
    expect(screen.getByText('Outside trip dates')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Alfama Loft/ })).toHaveClass('is-flagged')
  })

  it('shows no stay warning for a stay inside the trip dates (AC17)', () => {
    show(money())
    expect(screen.queryByText(/falls outside the trip dates/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an empty state with one Explore options button when nothing is chosen, and still Not included', () => {
    show(money({ bookings: [], included: [] }))
    expect(screen.getByText('Nothing booked yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore options' })).toHaveAttribute('href', '/explore')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: /usually not covered/i })).toBeInTheDocument()
  })
})
