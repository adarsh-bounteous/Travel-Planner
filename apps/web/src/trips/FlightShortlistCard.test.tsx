import { render } from '@testing-library/react'
import type { ShortlistFlight } from './api'
import { FlightShortlistCard } from './FlightShortlistCard'

const item = {
  reason: 'Cheapest',
  fits_budget: true,
  over_budget_by: 0,
  flight: {
    id: 'f1',
    provider: 'Skyline',
    mode: 'flight',
    travel_minutes: 120,
    stops: 0,
    source: 'amadeus',
    fare: 100,
    currency: 'EUR',
    estimate: true,
    fetched_at: '2026-01-01T00:00:00Z',
    url: '',
  },
} as unknown as ShortlistFlight

const show = (picked: boolean) =>
  render(
    <ul>
      <FlightShortlistCard item={item} tripCurrency="EUR" picked={picked} onPick={() => {}} />
    </ul>,
  )

describe('FlightShortlistCard motion', () => {
  it('plays a check on the picked flight only (AC13)', () => {
    expect(show(true).container.querySelector('.check-badge.is-playing')).not.toBeNull()
    expect(show(false).container.querySelector('.check-badge')).toBeNull()
  })

  it('renders a decorative animated route line (AC15)', () => {
    const line = show(false).container.querySelector('.route')
    expect(line).not.toBeNull()
    expect(line).toHaveAttribute('aria-hidden', 'true')
    expect(line).toHaveTextContent('')
  })
})
