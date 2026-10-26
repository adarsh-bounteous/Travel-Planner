import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ChosenStay, Trip } from './api'
import { ItineraryTab } from './ItineraryTab'

const noop = () => {}
const trip = (chosen: ChosenStay | null): Trip => ({
  id: 't1',
  name: 'Iberia',
  can_edit: true,
  currency: 'EUR',
  days: [{ date: '2027-01-01', name: 'Day 1' }],
  stays: [{ id: 's1', place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05', chosen }],
})
const casa = {
  property_id: 'p',
  name: 'Casa Azulejo',
  provider: 'Booking Nest',
  url: 'https://booking-nest.example/p',
  total: '480',
  currency: 'EUR',
}
const props = (t: Trip) => ({
  trip: t,
  onRename: noop,
  onAddReminder: noop,
  onEditReminder: noop,
  onAddActivity: noop,
  onMoveActivity: async () => {},
  onRemoveActivity: noop,
})
const tab = (t: Trip) => (
  <MemoryRouter>
    <ItineraryTab {...props(t)} />
  </MemoryRouter>
)

describe('itinerary stays', () => {
  it('lists a chosen stay with its dates and cost, and drops it once cleared (AC6, AC8)', () => {
    const { rerender } = render(tab(trip(casa)))
    const row = screen.getByText('Casa Azulejo').closest('.card') as HTMLElement
    expect(within(row).getByText(/480/)).toBeVisible()
    expect(within(row).getByText(/1 to 5 January/)).toBeVisible()
    rerender(tab(trip(null)))
    expect(screen.queryByText('Casa Azulejo')).not.toBeInTheDocument()
    expect(screen.getByText('No stay in your itinerary')).toBeVisible()
    expect(screen.getByText(/Choose a stay for 1 to 5 January/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Choose a stay' })).toHaveAttribute(
      'href',
      '/trips/t1/stays/s1/shortlist',
    )
  })

  it('shows no stays section when the trip has no stay rows, and no link to read-only viewers', () => {
    const { rerender } = render(tab({ ...trip(null), stays: [] }))
    expect(screen.queryByText('No stay in your itinerary')).toBeNull()
    rerender(tab({ ...trip(null), can_edit: false }))
    expect(screen.getByText('No stay in your itinerary')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Choose a stay' })).toBeNull()
  })

  it('shows the cost in the trip currency with the original beside it', () => {
    const t = trip({ ...casa, total: '100', currency: 'GBP' })
    t.cost = {
      currency: 'EUR',
      total: 120,
      budget: null,
      over_budget_by: 0,
      missing_categories: [],
      unpriced_count: 0,
      unconvertible_count: 0,
      rates: [{ currency: 'GBP', rate: 1.2 }],
    }
    render(tab(t))
    const row = screen.getByText('Casa Azulejo').closest('.card') as HTMLElement
    expect(within(row).getByText(/120/)).toBeVisible()
    expect(within(row).getByText(/100.*at 1.2/)).toBeVisible()
  })
})
