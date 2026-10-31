import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { RestaurantPick, Trip } from './api'
import { ItineraryTab } from './ItineraryTab'

const noop = () => {}
const pick = (overrides: Partial<RestaurantPick> = {}): RestaurantPick => ({
  id: 'p1',
  name: 'Casa Lima',
  city: 'Lisbon',
  cuisine: 'Portuguese',
  typical_price: '19',
  currency: 'EUR',
  url: null,
  date: null,
  meal: null,
  ...overrides,
})
const trip = (restaurants: RestaurantPick[], can_edit = true): Trip => ({
  id: 't1',
  name: 'Lisbon',
  can_edit,
  currency: 'EUR',
  traveller_count: 2,
  days: [
    { date: '2026-05-01', name: 'Day 1' },
    { date: '2026-05-02', name: 'Day 2' },
  ],
  restaurants,
})
const show = (t: Trip, onMoveRestaurant = vi.fn()) => {
  render(
    <MemoryRouter>
      <ItineraryTab
        trip={t}
        onRename={noop}
        onAddReminder={noop}
        onEditReminder={noop}
        onAddActivity={noop}
        onMoveActivity={async () => {}}
        onRemoveActivity={noop}
        onMoveRestaurant={onMoveRestaurant}
      />
    </MemoryRouter>,
  )
  return onMoveRestaurant
}

describe('restaurants in the itinerary', () => {
  it('shows an unscheduled pick in the Unscheduled card with its estimate (AC2, AC5)', () => {
    show(trip([pick()]))
    const unscheduled = within(screen.getByRole('region', { name: 'Unscheduled' }))
    expect(unscheduled.getByText('Casa Lima')).toBeInTheDocument()
    expect(unscheduled.getByText('Estimate 38 EUR')).toBeInTheDocument()
  })

  it('says nothing is unscheduled when so (AC2)', () => {
    show(trip([]))
    expect(screen.getByText(/No unscheduled restaurants/)).toBeInTheDocument()
  })

  it('shows a pick under its day with the meal label (AC3)', () => {
    show(trip([pick({ date: '2026-05-01', meal: 'lunch' })]))
    const day1 = within(screen.getByRole('region', { name: /1 May/ }))
    expect(day1.getByText('Lunch')).toBeInTheDocument()
    expect(day1.getByText('Casa Lima')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Unscheduled' })).queryByText('Casa Lima')).toBeNull()
    expect(within(screen.getByRole('region', { name: /2 May/ })).queryByText('Casa Lima')).toBeNull()
  })

  it('shows a moved pick only under its new day (AC4)', () => {
    show(trip([pick({ date: '2026-05-02', meal: 'lunch' })]))
    expect(within(screen.getByRole('region', { name: /1 May/ })).queryByText('Casa Lima')).toBeNull()
    expect(within(screen.getByRole('region', { name: /2 May/ })).getByText('Casa Lima')).toBeInTheDocument()
  })

  it('shows "Estimate unavailable" for a pick with no price (AC9)', () => {
    show(trip([pick({ typical_price: null })]))
    expect(screen.getByText('Estimate unavailable')).toBeInTheDocument()
  })

  it('asks to schedule an unscheduled pick for an editor (AC11)', () => {
    const onMove = show(trip([pick()]))
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Casa Lima' }))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('keeps Move for a pick that has a day (AC11)', () => {
    const onMove = show(trip([pick({ date: '2026-05-01', meal: 'dinner' })]))
    expect(screen.queryByRole('button', { name: 'Schedule Casa Lima' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Move Casa Lima' }))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('has no Schedule or Move button for a viewer', () => {
    show(trip([pick(), pick({ id: 'p2', name: 'Cervejaria', date: '2026-05-01', meal: 'lunch' })], false))
    expect(screen.queryByRole('button', { name: /Schedule|Move/ })).toBeNull()
  })

  it('places a pick with the default day and meal under that day, not in Unscheduled (AC3, AC4)', () => {
    show(trip([pick({ date: '2026-05-01', meal: 'dinner' })]))
    expect(within(screen.getByRole('region', { name: /1 May/ })).getByText('Dinner')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Unscheduled' })).queryByText('Casa Lima')).toBeNull()
  })

  it('lists a pick with no day in the Unscheduled box (AC5)', () => {
    show(trip([pick()]))
    expect(within(screen.getByRole('region', { name: 'Unscheduled' })).getByText('Casa Lima')).toBeInTheDocument()
  })

  it('explains the Unscheduled box (AC10)', () => {
    show(trip([pick()]))
    const box = within(screen.getByRole('region', { name: 'Unscheduled' }))
    expect(box.getByText('Holds picks with no day yet.')).toBeInTheDocument()
  })

  it('keeps an unscheduled pick visible on a trip without dates (AC8)', () => {
    show({ ...trip([pick()]), days: [] })
    const box = within(screen.getByRole('region', { name: 'Unscheduled' }))
    expect(box.getByText('Casa Lima')).toBeInTheDocument()
    expect(screen.getByText('Add trip dates to give picks a day.')).toBeInTheDocument()
  })

  it('links to the restaurant shortlist', () => {
    show(trip([]))
    expect(screen.getByRole('link', { name: 'Add restaurants' })).toHaveAttribute(
      'href',
      '/trips/t1/restaurant-options/shortlist',
    )
  })
})
