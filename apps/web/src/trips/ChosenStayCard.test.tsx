import { render, screen } from '@testing-library/react'
import type { ChosenStay } from './api'
import { ChosenStayCard } from './ChosenStayCard'

const URL = 'https://booking-nest.example/stays/casa-azulejo?checkin=2027-01-01&checkout=2027-01-05'
const chosen: ChosenStay = {
  property_id: 'casa-azulejo',
  name: 'Casa Azulejo',
  provider: 'Booking Nest',
  url: URL,
  total: '480',
  currency: 'EUR',
}
const noop = () => {}
const show = (c: ChosenStay | null, canEdit = true) =>
  render(<ChosenStayCard chosen={c} canEdit={canEdit} onChange={noop} onClear={noop} />)

describe('chosen stay card', () => {
  it('links to the provider booking page in a new tab (AC4, AC5)', () => {
    show(chosen)
    const link = screen.getByRole('link', { name: /Book on provider site/ })
    expect(link).toHaveAttribute('href', URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByRole('heading', { name: 'Casa Azulejo' })).toBeVisible()
    expect(screen.getByText(/480/)).toBeVisible()
  })

  it('renders no link for a non-http(s) url', () => {
    show({ ...chosen, url: 'javascript:alert(1)' })
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows an empty state and no link when nothing is chosen', () => {
    show(null)
    expect(screen.getByText('No stay chosen yet')).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('offers no payment UI (AC9)', () => {
    show(chosen)
    expect(screen.queryByRole('button', { name: /pay|checkout|card number/i })).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    expect(screen.getByText(/nothing is paid in the app/i)).toBeVisible()
  })

  it('hides change and clear for read-only travellers but keeps the link', () => {
    show(chosen, false)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: /Book on provider site/ })).toBeVisible()
  })
})
