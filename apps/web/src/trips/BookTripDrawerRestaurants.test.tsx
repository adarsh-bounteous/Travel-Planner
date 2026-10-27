import { render, screen, within } from '@testing-library/react'
import type { RestaurantPick } from './api'
import { BookTripDrawer } from './BookTripDrawer'

const pick = (name: string, url: string | null): RestaurantPick => ({
  id: name,
  name,
  city: 'Lisbon',
  cuisine: 'Portuguese',
  typical_price: null,
  currency: 'EUR',
  url,
  date: null,
  meal: null,
})

it('lists a picked restaurant with its link (AC3)', () => {
  render(<BookTripDrawer options={[]} restaurants={[pick('Mesa Real', 'https://example.com/mesa')]} onClose={vi.fn()} />)
  expect(screen.getByText('Mesa Real')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View listing for Mesa Real' })).toHaveAttribute('href', 'https://example.com/mesa')
  expect(screen.getByText(/1 chosen option\./)).toBeInTheDocument()
})

it('offers no in-app reserve or confirm control (AC5)', () => {
  render(<BookTripDrawer options={[]} restaurants={[pick('Mesa Real', 'https://example.com/mesa')]} onClose={vi.fn()} />)
  const drawer = screen.getByRole('dialog')
  expect(within(drawer).queryByRole('button', { name: /reserve|book|confirm/i })).not.toBeInTheDocument()
})

it('shows the no-link text for a pick without a link (AC6)', () => {
  render(<BookTripDrawer options={[]} restaurants={[pick('Cantina Nova', null)]} onClose={vi.fn()} />)
  expect(screen.getByText('No booking link available')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
