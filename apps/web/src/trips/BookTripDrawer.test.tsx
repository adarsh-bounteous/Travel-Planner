import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ChosenOption } from './api'
import { BookTripDrawer } from './BookTripDrawer'
import { pick } from './insuranceFixtures'

const hotel: ChosenOption = {
  id: 'o1',
  title: 'Hotel Alfama',
  category: 'Stays',
  date: '2027-03-03',
  booking_url: 'https://example.com/hotel-alfama',
}

const show = (options: ChosenOption[], onClose = vi.fn()) => {
  render(<BookTripDrawer options={options} onClose={onClose} />)
  return onClose
}

describe('insurance entry', () => {
  const insurance = pick()

  it('links to the picked plan provider site (AC9)', () => {
    render(<BookTripDrawer options={[]} insurance={insurance} onClose={() => {}} />)
    const item = screen.getByText(/Insurance provider site: Globetrek/).closest('li')!
    const link = within(item).getByRole('link', { name: /Open booking page/ })
    expect(link).toHaveAttribute('href', insurance.url)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('has no insurance entry without a pick, or for a non-http(s) link (AC9)', () => {
    const { unmount } = render(<BookTripDrawer options={[hotel]} onClose={() => {}} />)
    expect(screen.queryByText(/Insurance provider site/)).toBeNull()
    unmount()
    render(<BookTripDrawer options={[]} insurance={{ ...insurance, url: 'javascript:alert(1)' }} onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: /Open booking page/ })).toBeNull()
  })
})

it('opens the booking page outside the app', () => {
  show([hotel])
  const link = screen.getByRole('link', { name: /Open booking page/ })
  expect(link).toHaveAttribute('href', 'https://example.com/hotel-alfama')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
})

it('treats a non-http link as no link', () => {
  show([{ ...hotel, booking_url: 'javascript:alert(1)' }])
  expect(screen.queryByRole('link', { name: /Open booking page/ })).not.toBeInTheDocument()
  expect(screen.getByText('No booking link is available for this option.')).toBeInTheDocument()
})

it('has no in-app booking form, payment step or confirmation', () => {
  show([hotel])
  const dialog = within(screen.getByRole('dialog', { name: 'Book trip' }))
  expect(dialog.queryByRole('textbox')).not.toBeInTheDocument()
  expect(dialog.queryByRole('button', { name: /pay|confirm|reserve/i })).not.toBeInTheDocument()
  expect(dialog.getByText(/You book and pay on the provider's site/)).toBeInTheDocument()
})

it.each([null, undefined])('notes an option with no booking link (%s)', (booking_url) => {
  show([{ ...hotel, title: 'Tram pass', booking_url }])
  expect(screen.getByText('No booking link is available for this option.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Open booking page/ })).not.toBeInTheDocument()
  expect(screen.getByText('Tram pass')).toBeInTheDocument()
})

it('counts the chosen options', () => {
  show([hotel])
  expect(screen.getByText(/1 chosen option\./)).toBeInTheDocument()
})

it('lists options by date', () => {
  show([
    { ...hotel, id: 'b', title: 'Later', date: '2027-03-05' },
    { ...hotel, id: 'a', title: 'Earlier', date: '2027-03-03' },
  ])
  const titles = screen.getAllByRole('listitem').map((li) => li.querySelector('.option-title')?.textContent)
  expect(titles).toEqual(['Earlier', 'Later'])
})

it('closes from the Close button', () => {
  const onClose = show([hotel])
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalled()
})
