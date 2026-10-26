import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { FlightShortlist, ShortlistFlight, SourceResult, Trip } from './api'
import { formatRetrieved } from './flights'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = {
  id: 't1',
  name: 'Lisbon trip',
  budget: 600,
  currency: 'EUR',
  cost: {
    currency: 'EUR',
    total: 530,
    budget: 600,
    over_budget_by: 0,
    missing_categories: [],
    unpriced_count: 0,
    unconvertible_count: 0,
    rates: [],
  },
}

const flight = (
  rank: number,
  provider: string,
  fare: number,
  minutes: number,
  stops: number,
  source: string,
  reason: string,
  extra: Partial<ShortlistFlight['flight']> = {},
  over = 0,
): ShortlistFlight => ({
  rank,
  flight: {
    id: provider.toLowerCase().replace(/\W+/g, '-'),
    provider,
    source,
    fare: String(fare),
    currency: 'EUR',
    travel_minutes: minutes,
    stops,
    fetched_at: '2026-10-26T09:14:00Z',
    url: 'https://example.com/f',
    ...extra,
  },
  fit: 100,
  fits_budget: over === 0,
  over_budget_by: String(over),
  reason,
})

const OK: SourceResult[] = [
  { name: 'Flight search API', status: 'ok' },
  { name: 'Web search', status: 'ok' },
  { name: 'Partner API', status: 'ok' },
]

const all = (): ShortlistFlight[] => [
  flight(1, 'Algarve Air', 54, 55, 0, 'Flight search API', 'Cheapest', {
    deal: 'EUR 12.00 off online fares until 31 Oct',
  }),
  flight(2, 'Lusitania Jet', 59, 50, 0, 'Partner API', 'Fastest'),
  flight(3, 'Atlantic Connect', 68, 140, 1, 'Web search', 'Fits your saved preferences', {}, 0),
  flight(4, 'Costa Premium', 96, 50, 0, 'Web search', 'Balanced fare and travel time', {}, 26),
]

const body = (flights: ShortlistFlight[], sources = OK): FlightShortlist => ({
  origin: 'Lisbon',
  destination: 'Faro',
  date: '2027-11-18',
  budget: 600,
  currency: 'EUR',
  sources,
  flights,
})

const PAGE = '/trips/t1/flights?origin=Lisbon&destination=Faro&date=2027-11-18'
const API = '/trips/t1/flights/shortlist?origin=Lisbon&destination=Faro&date=2027-11-18'

const open = (reply: FlightShortlist | null, status = 200) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    [`GET ${API}`]: reply ? { status, body: reply } : { status },
  })
  renderAt(PAGE)
  return fetchMock
}

// The app header has its own list items, so count only the flights list.
const findCards = async () =>
  within(await screen.findByRole('list', { name: 'Flights ranked, best first' })).getAllByRole('listitem')

describe('flight shortlist page', () => {
  it('lists the ranked flights for the leg (AC1)', async () => {
    open(body(all()))
    const list = await screen.findByRole('list', { name: 'Flights ranked, best first' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('heading', { level: 1, name: 'Flights, Lisbon to Faro, 18 Nov' })).toBeInTheDocument()
    expect(screen.getByText(/Your trip budget is .*600\.00.* and you have .*70\.00.* left/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to trip' })).toHaveAttribute('href', '/trips/t1')
  })

  it('reads the leg from the query and calls the API with it (AC2)', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: trip },
      'GET /trips/t1/flights/shortlist?origin=Faro&destination=Porto&date=2027-11-22': {
        status: 200,
        body: { ...body(all()), origin: 'Faro', destination: 'Porto', date: '2027-11-22' },
      },
    })
    renderAt('/trips/t1/flights?origin=Faro&destination=Porto&date=2027-11-22')
    expect(await screen.findByRole('heading', { level: 1, name: 'Flights, Faro to Porto, 22 Nov' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/trips/t1/flights/shortlist?origin=Faro&destination=Porto&date=2027-11-22'),
      expect.anything(),
    )
  })

  it('shows provider, fare, time, stops, deal, reason and retrieval time on each card (AC5 to AC7, AC14)', async () => {
    open(body(all()))
    const cards = await findCards()
    expect(within(cards[0]).getByText('Algarve Air')).toBeInTheDocument()
    expect(within(cards[0]).getByText(/€54\.00|EUR\s?54\.00/)).toBeInTheDocument()
    expect(within(cards[0]).getByText('55 min')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Nonstop')).toBeInTheDocument()
    expect(within(cards[0]).getByText('via Flight search API')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Deal: EUR 12.00 off online fares until 31 Oct')).toBeInTheDocument()
    expect(within(cards[1]).queryByText(/^Deal:/)).not.toBeInTheDocument()
    expect(within(cards[0]).getByText('Cheapest')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Fastest')).toBeInTheDocument()
    expect(within(cards[2]).getByText('2 h 20 min')).toBeInTheDocument()
    expect(within(cards[2]).getByText('1 stop')).toBeInTheDocument()
    expect(
      within(cards[0]).getByText(`indicative as of ${formatRetrieved('2026-10-26T09:14:00Z')}`),
    ).toBeInTheDocument()
  })

  it('marks over-budget flights and lists them after the fitting ones (AC9 to AC12)', async () => {
    open(body(all()))
    const cards = await findCards()
    expect(cards).toHaveLength(4)
    expect(within(cards[0]).getByText('Fits your trip budget')).toBeInTheDocument()
    expect(within(cards[0]).queryByText(/Over budget/)).not.toBeInTheDocument()
    expect(within(cards[3]).getByText(/Over budget by .*26\.00/)).toBeInTheDocument()
    const flags = cards.map((c) => within(c).queryByText(/Over budget by/) !== null)
    expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)))
  })

  it('puts fitting flights first even when the API sends an over-budget one early', async () => {
    const [a, b, c] = all()
    open(body([{ ...a, fits_budget: false, over_budget_by: '5' }, b, c]))
    const cards = await findCards()
    expect(within(cards[0]).getByText('Lusitania Jet')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Algarve Air')).toBeInTheDocument()
  })

  it('keeps the other flights and names the source that did not answer (AC13)', async () => {
    open(
      body(all().slice(0, 3), [
        OK[0],
        OK[1],
        { name: 'Partner API', status: 'timed_out' },
      ]),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Partner API did not respond within 5 seconds.')
    expect(await findCards()).toHaveLength(3)
    expect(screen.getByText('Some flight sources did not respond. Showing the rest.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry partner API' })).toBeInTheDocument()
  })

  it('retries by reloading the shortlist', async () => {
    const fetchMock = open(body(all().slice(0, 3), [OK[0], OK[1], { name: 'Partner API', status: 'failed' }]))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry partner API' }))
    await findCards()
    expect(fetchMock.mock.calls.filter(([path]) => path === API).length).toBeGreaterThanOrEqual(2)
  })

  it('says no flights were found and offers a change of dates or mode (AC15)', async () => {
    open(body([]))
    expect(await screen.findByText('No flights were found for this route and date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change dates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose another travel mode' })).toBeInTheDocument()
  })

  it('shows skeletons while loading and an alert with Retry when the request fails', async () => {
    open(null, 500)
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your flights")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('explains the ranking on demand', async () => {
    open(body(all()))
    const toggle = await screen.findByRole('button', { name: /How we rank/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Fare counts most/)).toBeInTheDocument()
  })
})
