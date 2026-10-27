import { render, screen } from '@testing-library/react'
import type { ChosenSim } from './api'
import { BookTripDrawer } from './BookTripDrawer'

const sim: ChosenSim = {
  option_id: 'roamly-europe-10',
  name: 'Roamly Europe 10 GB',
  provider: 'Web search',
  sim_type: 'esim',
  valid_from: '2027-03-01',
  valid_to: '2027-03-31',
  data_gb: '10',
  price: '14.50',
  currency: 'EUR',
  url: 'https://roamly.example/europe-10',
}

it('lists the picked SIM with its booking link (AC12)', () => {
  render(<BookTripDrawer options={[]} sim={sim} onClose={vi.fn()} />)
  expect(screen.getByText('SIM: Roamly Europe 10 GB')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Open booking page/ })).toHaveAttribute('href', sim.url)
  expect(screen.getByText(/1 chosen option\./)).toBeInTheDocument()
})

it('shows no link for a non-http SIM URL', () => {
  render(<BookTripDrawer options={[]} sim={{ ...sim, url: 'javascript:alert(1)' }} onClose={vi.fn()} />)
  expect(screen.getByText(/No booking link is available/)).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
