import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Trip } from './api'
import { ItineraryTab } from './ItineraryTab'

const noop = () => {}
const trip = (transport: Trip['transport']): Trip => ({
  id: 't1',
  name: 'Iberia',
  can_edit: true,
  currency: 'EUR',
  days: [{ date: '2027-01-01', name: 'Day 1' }],
  transport,
  cost: {
    currency: 'EUR',
    total: 205,
    budget: null,
    over_budget_by: 0,
    missing_categories: [],
    unpriced_count: 0,
    unconvertible_count: 0,
    rates: [],
  },
})
const tab = (t: Trip) => (
  <MemoryRouter>
    <ItineraryTab
      trip={t}
      onRename={noop}
      onAddReminder={noop}
      onEditReminder={noop}
      onAddActivity={noop}
      onMoveActivity={async () => {}}
      onRemoveActivity={noop}
    />
  </MemoryRouter>
)
const flight = {
  leg: 'destination' as const,
  option_id: 'f',
  mode: 'flight' as const,
  provider: 'Atlantic Air',
  origin: 'Home',
  destination: 'Lisbon',
  date: '2027-01-01',
  estimate: false,
  fare: '180',
  picked_fare: '180',
  currency: 'EUR',
  url: 'https://airline.example/a',
}

describe('itinerary chosen options', () => {
  it('lists the picks and the trip total (AC9)', () => {
    const taxi = { ...flight, leg: 'local_taxi' as const, mode: 'taxi' as const, provider: 'Taxi Lisboa', estimate: true, fare: '25' }
    render(tab(trip([flight, taxi])))
    const section = screen.getByRole('heading', { name: 'Chosen options' }).closest('div')!
    expect(within(section).getByText(/Atlantic Air/)).toBeInTheDocument()
    expect(within(section).getByText(/Estimate .*25\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Trip total 205 EUR/)).toBeInTheDocument()
  })

  it('says so when nothing is picked', () => {
    render(tab(trip([])))
    expect(screen.getByText('No transport picked yet. Pick transport on the trip.')).toBeInTheDocument()
  })
})
