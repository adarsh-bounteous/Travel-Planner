import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Trip } from './api'
import { RestaurantsCard } from './RestaurantsCard'

const base: Trip = {
  id: 't1',
  name: 'Lisbon',
  traveller_count: 1,
  days: [
    { date: '2026-05-01', name: 'Day 1' },
    { date: '2026-05-02', name: 'Day 2' },
  ],
  restaurants: [],
}
const pick = {
  id: 'p1',
  name: 'Time Out Market',
  city: 'Lisbon',
  cuisine: 'Food hall',
  typical_price: '45',
  currency: 'EUR',
  url: null,
  date: '2026-05-02',
  meal: 'dinner' as const,
}
const show = (trip: Trip, canEdit = true) =>
  render(
    <MemoryRouter>
      <RestaurantsCard trip={trip} canEdit={canEdit} />
    </MemoryRouter>,
  )

describe('RestaurantsCard', () => {
  it('shows a pick with its day, meal, estimate and a link to the shortlist (AC1)', () => {
    show({ ...base, restaurants: [pick] })
    const card = within(screen.getByRole('region', { name: 'Restaurants' }))
    expect(card.getByText('Time Out Market')).toBeInTheDocument()
    expect(card.getByText(/Day 2, Dinner/)).toBeInTheDocument()
    expect(card.getByText(/Estimate 45 EUR/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'View shortlist' })).toHaveAttribute(
      'href',
      '/trips/t1/restaurant-options/shortlist',
    )
  })

  it('marks a pick with no day as Unscheduled', () => {
    show({ ...base, restaurants: [{ ...pick, date: null, meal: null }] })
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
  })

  it('shows an empty state with a link to add a restaurant (AC9)', () => {
    show(base)
    expect(screen.getByText('No restaurants picked yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a restaurant' })).toHaveAttribute(
      'href',
      '/trips/t1/restaurant-options/shortlist',
    )
  })

  it('has no add link for a viewer', () => {
    show(base, false)
    expect(screen.queryByRole('link', { name: 'Add a restaurant' })).toBeNull()
  })
})
