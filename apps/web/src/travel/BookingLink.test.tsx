import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { BookingLink } from './BookingLink'

const renderLink = (url: string) =>
  render(
    <MemoryRouter>
      <BookingLink url={url}>Book</BookingLink>
    </MemoryRouter>,
  )

describe('BookingLink', () => {
  it('opens a local link inside the app, never in a new tab (AC4, AC5)', () => {
    renderLink('local://booking/stay-lisbon-1?start=2027-03-12&end=2027-03-15')
    const link = screen.getByRole('link', { name: 'Book' })
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/explore\/travel\/booking\?ref=local%3A%2F%2Fbooking/))
    expect(link).not.toHaveAttribute('target')
  })

  it('keeps a provider link external', () => {
    renderLink('https://provider.test/x')
    const link = screen.getByRole('link', { name: 'Book' })
    expect(link).toHaveAttribute('href', 'https://provider.test/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
