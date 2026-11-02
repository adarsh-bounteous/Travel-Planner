import { screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const liveTrip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Agra trip',
  destination: 'Agra, India',
  country: 'India',
  place: 'Agra',
  place_source: 'live',
  start_date: '2027-03-03',
  end_date: '2027-03-05',
  budget: 1500,
  currency: 'EUR',
  is_owner: true,
  days: [],
  options: [],
  ...overrides,
})

const STATUS = {
  destination: { country: 'India', place: 'Agra', label: 'Agra, India' },
  features: { recommendations: 'limited', visa: 'available', itinerary: 'limited' },
}

describe('A trip to a live place', () => {
  it('lists what data is available and what is limited (AC13, AC15)', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: liveTrip() },
      'GET /trips/t1/data-status': { status: 200, body: STATUS },
    })
    renderAt('/trips/t1')
    const card = (await screen.findByRole('heading', { name: 'Data for Agra, India' })).closest('section')!
    const rows = Array.from(card.querySelectorAll('.status-row')).map((r) => r.textContent)
    expect(rows).toEqual(['RecommendationsLimited', 'Visa rulesAvailable', 'ItineraryLimited'])
    expect(within(card).getAllByText('Limited')[0]).toHaveClass('badge-warning')
    expect(within(card).getByText('Available')).toHaveClass('badge-success')
  })

  it('shows no data card for a starter trip', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: liveTrip({ place_source: 'starter' }) } })
    renderAt('/trips/t1')
    await screen.findByRole('heading', { level: 1, name: 'Agra trip' })
    expect(screen.queryByRole('heading', { name: /^Data for/ })).not.toBeInTheDocument()
  })

  it('says an old trip was matched to a place picked before (AC23)', async () => {
    stubApi({
      'GET /trips/t1': {
        status: 200,
        body: liveTrip({ place_source: 'live', rematched_from: 'Agra' }),
      },
      'GET /trips/t1/data-status': { status: 200, body: STATUS },
    })
    renderAt('/trips/t1')
    expect(
      await screen.findByText('Saved as “Agra”. We matched it to Agra, India, which you picked before.'),
    ).toBeInTheDocument()
  })

  it('shows the same note on the trip list (AC23)', async () => {
    stubApi({
      'GET /trips': { status: 200, body: [liveTrip({ rematched_from: 'Agra' })] },
    })
    renderAt('/')
    expect(
      await screen.findByText('Saved as “Agra”. We matched it to Agra, India, which you picked before.'),
    ).toBeInTheDocument()
  })
})
