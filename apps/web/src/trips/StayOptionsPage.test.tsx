import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { StayOffer, StayOptions, StayProperty, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = {
  id: 't1',
  name: 'Iberia',
  stays: [{ id: 's1', place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05' }],
}

const offer = (provider: string, price: string): StayOffer => ({
  provider,
  price_per_night: price,
  total: String(Number(price) * 4),
  currency: 'EUR',
  fetched_at: '2026-01-01T10:42:00Z',
  url: `https://example.com/${provider}`,
})

const property = (name: string, offers: StayOffer[]): StayProperty => ({
  id: name,
  name,
  property_type: 'hotel',
  rooms: 1,
  stars: 4,
  area: 'Alfama',
  amenities: ['wifi', 'pool'],
  nearby: false,
  offers,
})

const options = (properties: StayProperty[]): StayOptions => ({
  place: 'Lisbon',
  start_date: '2027-01-01',
  end_date: '2027-01-05',
  nights: 4,
  properties,
  price_min: properties.length ? '118' : null,
  price_max: properties.length ? '124' : null,
})

const BASE = '/trips/t1/stays/s1/options?property_type=hotel&rooms=1'
const found = options([
  property('Hotel Alfama Terrace', [offer('Booknest', '118'), offer('Staylink', '124')]),
  property('Pensão Rossio', [offer('Roomly', '62')]),
])

const open = (replies: Parameters<typeof stubApi>[0]) => {
  const fetchMock = stubApi({ 'GET /trips/t1': { status: 200, body: trip }, ...replies })
  renderAt('/trips/t1/stays/s1/options')
  return fetchMock
}

const urls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([path]) => path as string).filter((p) => p.includes('/options'))

describe('stay options page', () => {
  it('lists one property once with both offers side by side (AC7, AC8, AC9)', async () => {
    open({ [`GET ${BASE}`]: { status: 200, body: found } })
    expect(await screen.findByRole('heading', { name: 'Stays in Lisbon, 1 to 5 January' })).toBeInTheDocument()
    expect(await screen.findByText('Showing 2 stays')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3, name: 'Hotel Alfama Terrace' })).toHaveLength(1)
    expect(screen.getByText('Offered by 2 providers')).toBeInTheDocument()
    expect(screen.getByText('Offered by 1 provider')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Hotel Alfama Terrace' })
    expect(within(card).getAllByText(/per night/)).toHaveLength(2)
    expect(within(card).getByText(/€118/)).toBeInTheDocument()
    expect(within(card).getByText(/€124/)).toBeInTheDocument()
    expect(screen.getAllByText(/^Fetched /)).toHaveLength(3)
    expect(screen.getAllByText("Final price confirmed on provider's site")).toHaveLength(2)
    expect(screen.getByText('Prices from €118 to €124 per night, as fetched.')).toBeInTheDocument()
    const link = within(card).getByRole('link', { name: 'View on Booknest for Hotel Alfama Terrace' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('offers exactly the five amenities (AC6)', async () => {
    open({ [`GET ${BASE}`]: { status: 200, body: found } })
    const group = await screen.findByRole('group', { name: 'Amenities' })
    expect(within(group).getAllByRole('checkbox').map((c) => c.parentElement?.textContent)).toEqual([
      'Free Wi-Fi',
      'Breakfast included',
      'Parking',
      'Pool',
      'Air conditioning',
    ])
  })

  it('shows a skeleton while loading (aria-busy)', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: trip },
      [`GET ${BASE}`]: { status: 200, body: found },
    })
    const answer = fetchMock.getMockImplementation()!
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    fetchMock.mockImplementation(async (path, init) => {
      if (path.includes('/options')) await gate
      return answer(path, init)
    })
    renderAt('/trips/t1/stays/s1/options')
    const results = (await screen.findByRole('button', { name: 'Applying…' })).closest('form')!
      .nextElementSibling!
    expect(results).toHaveAttribute('aria-busy', 'true')
    expect(results.querySelectorAll('.sk-card')).toHaveLength(3)
    release()
    expect(await screen.findByText('Showing 2 stays')).toBeInTheDocument()
    expect(results).toHaveAttribute('aria-busy', 'false')
  })

  it('sends only the filters that are on (AC4, AC5)', async () => {
    const fetchMock = open({
      [`GET ${BASE}`]: { status: 200, body: found },
      'GET /trips/t1/stays/s1/options?property_type=hotel&rooms=1&amenities=pool&stars=5': {
        status: 200,
        body: found,
      },
    })
    await screen.findByText('Showing 2 stays')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pool' }))
    fireEvent.click(screen.getByRole('button', { name: '5 stars' }))
    expect(screen.getByRole('button', { name: '5 stars' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await screen.findByText('Showing 2 stays')
    expect(urls(fetchMock)).toEqual([
      BASE,
      '/trips/t1/stays/s1/options?property_type=hotel&rooms=1&amenities=pool&stars=5',
    ])
  })

  it('shows a retry when the fetch fails', async () => {
    open({ [`GET ${BASE}`]: { status: 500 } })
    expect(
      await screen.findByText("We couldn't load stays. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('no match (AC10)', () => {
  const empty = options([])
  const RELAXED = BASE
  const WIDE = `${BASE}&widen=true`
  const FILTERED = `${BASE}&amenities=pool&stars=5`

  const openEmpty = async (replies: Parameters<typeof stubApi>[0]) => {
    const fetchMock = open({ [`GET ${BASE}`]: { status: 200, body: empty }, ...replies })
    expect(await screen.findByRole('heading', { name: 'No stays match' })).toBeInTheDocument()
    return fetchMock
  }

  it('shows the message with both actions and what was searched', async () => {
    await openEmpty({})
    expect(screen.getByRole('button', { name: 'Relax filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Widen search' })).toBeInTheDocument()
    expect(screen.getByText('Hotel, 1 room in Lisbon.')).toBeInTheDocument()
  })

  it('Relax filters re-queries without budget or optional filters, and says if still empty', async () => {
    const fetchMock = await openEmpty({ [`GET ${FILTERED}`]: { status: 200, body: empty } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pool' }))
    fireEvent.click(screen.getByRole('button', { name: '5 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await screen.findByText('Hotel, 1 room, pool, 5 stars in Lisbon.')
    fireEvent.click(screen.getByRole('button', { name: 'Relax filters' }))
    expect(await screen.findByText('Still no match.')).toBeInTheDocument()
    expect(screen.getByText('Optional filters and budget cleared.')).toBeInTheDocument()
    expect(urls(fetchMock).at(-1)).toBe(RELAXED)
    expect(screen.getByRole('checkbox', { name: 'Pool' })).not.toBeChecked()
  })

  it('Widen search re-queries with widen=true and nearby towns can appear', async () => {
    const fetchMock = await openEmpty({
      [`GET ${WIDE}`]: { status: 200, body: options([property('Cascais Bay Hotel', [offer('Roomly', '99')])]) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Widen search' }))
    expect(await screen.findByText('Cascais Bay Hotel')).toBeInTheDocument()
    expect(urls(fetchMock).at(-1)).toBe(WIDE)
    expect(screen.getByRole('heading', { name: 'Stays in Lisbon and nearby, 1 to 5 January' })).toBeInTheDocument()
    expect(screen.getByText('Searching Lisbon and nearby towns.')).toBeInTheDocument()
  })
})
