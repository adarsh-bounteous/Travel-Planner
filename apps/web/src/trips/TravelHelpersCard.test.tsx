import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Trip } from './api'
import { TravelHelpersCard } from './TravelHelpersCard'

it('links the Overview tab to both helpers', () => {
  const trip = { id: 't1', name: 'Tokyo', destination: 'Tokyo', start_date: '2026-11-03', end_date: '2026-11-09' } as Trip
  render(
    <MemoryRouter>
      <TravelHelpersCard trip={trip} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Currency helper' })).toHaveAttribute('href', '/trips/t1/currency')
  expect(screen.getByRole('link', { name: 'Weather helper' })).toHaveAttribute('href', '/trips/t1/weather')
})
