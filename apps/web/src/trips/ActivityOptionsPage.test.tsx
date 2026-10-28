import { screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { ActivityOption, ActivityOptions, ActivityPrice, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = { id: 't1', name: 'Iberia' }

const price = (provider: string, adult: string, source: ActivityPrice['source'] = 'partner'): ActivityPrice => ({
  provider,
  source,
  adult_price: adult,
  child_price: null,
  group_estimate: String(Number(adult) * 2),
  currency: 'EUR',
  fetched_at: '2026-01-01T10:42:00Z',
  url: `https://example.com/${provider}`,
  offer: null,
})

const option = (title: string, over: Partial<ActivityOption> = {}): ActivityOption => ({
  id: title,
  title,
  kind: 'ticket',
  interests: ['museum'],
  provider: 'Lisbon Tours Co',
  adult_price: '18',
  child_price: null,
  group_estimate: '36',
  group_estimate_indicative: true,
  currency: 'EUR',
  offer: null,
  prices: [price('Lisbon Tours Co', '18', 'web_search')],
  ...over,
})

const LISBON = { country: 'Portugal', place: 'Lisbon', label: 'Lisbon, Portugal' }

const open = (options: ActivityOption[], over: Partial<ActivityOptions> = {}) => {
  const body: ActivityOptions = {
    place: 'Lisbon',
    destination: LISBON,
    status: 'ready',
    travellers: 2,
    options,
    ...over,
  }
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/activity-options': { status: 200, body },
  })
  renderAt('/trips/t1/activity-options')
}

describe('activity options page', () => {
  it('shows provider, indicative group estimate and adult price (AC3-6)', async () => {
    open([option('Tile Museum')])
    const card = await screen.findByRole('article', { name: 'Tile Museum' })
    expect(within(card).getAllByText('Lisbon Tours Co').length).toBeGreaterThan(0)
    expect(within(card).getByText(/indicative group estimate/i)).toBeInTheDocument()
    expect(within(card).getByText(/€36/)).toBeInTheDocument()
    expect(within(card).getByText(/adult/i)).toBeInTheDocument()
    expect(within(card).getAllByText(/€18/).length).toBeGreaterThan(0)
  })

  it('shows the child price only when known (AC7, AC8)', async () => {
    open([option('Tile Museum', { child_price: '9' }), option('Sunset Sail')])
    const known = await screen.findByRole('article', { name: 'Tile Museum' })
    expect(within(known).getByText(/child/i)).toBeInTheDocument()
    expect(within(known).getByText(/€9/)).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Sunset Sail' })).queryByText(/child/i)).not.toBeInTheDocument()
  })

  it('shows the offer (AC9)', async () => {
    open([option('Sintra Day Trip', { offer: '10% off online' })])
    expect(await screen.findByText('10% off online')).toBeInTheDocument()
  })

  it('lists each source price with provider and date (AC15)', async () => {
    open([option('Tile Museum', { prices: [price('Lisbon Tours Co', '18', 'web_search'), price('GetYourTrip', '20')] })])
    const entries = await screen.findAllByTestId('price-entry')
    expect(entries).toHaveLength(2)
    expect(within(entries[1]).getByText(/GetYourTrip/)).toBeInTheDocument()
    expect(within(entries[1]).getByText(/1 Jan/)).toBeInTheDocument()
  })

  it('says nothing matches and suggests a change when empty (AC16)', async () => {
    open([])
    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument()
    expect(screen.getByText(/change your interests or budget/i)).toBeInTheDocument()
  })

  it('shows the chosen destination label (AC4, AC5)', async () => {
    open([option('Tile Museum')])
    expect(await screen.findByText('Destination: Lisbon, Portugal')).toBeInTheDocument()
  })

  it('asks to choose a destination when there is none (AC6, AC8)', async () => {
    open([], { destination: null, status: 'no_destination' })
    expect(await screen.findByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument()
    expect(screen.queryByText(/nothing matches/i)).not.toBeInTheDocument()
  })

  it('says there is no information for a place with no data (AC9)', async () => {
    open([], { status: 'no_place_data' })
    expect(await screen.findByText('No information available for this place')).toBeInTheDocument()
    expect(screen.queryByText(/nothing matches/i)).not.toBeInTheDocument()
  })
})
