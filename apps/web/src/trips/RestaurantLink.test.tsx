import { render, screen } from '@testing-library/react'
import { RestaurantLink } from './RestaurantLink'

it('links to the listing page when there is one (AC1)', () => {
  render(<RestaurantLink name="Casa Lima" url="https://example.com/r" />)
  expect(screen.getByRole('link', { name: 'View listing for Casa Lima' })).toHaveAttribute('href', 'https://example.com/r')
  expect(screen.queryByText('No booking link available')).not.toBeInTheDocument()
})

it.each([null, '', 'javascript:alert(1)'])('shows the no-link text for %s (AC2)', (url) => {
  render(<RestaurantLink name="Zaytoon" url={url} />)
  expect(screen.getByText('No booking link available')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
