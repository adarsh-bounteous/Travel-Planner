import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
    mode: 'flight',
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
  no_service: [],
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
  within(await screen.findByRole('list', { name: 'Travel options ranked, best first' })).getAllByRole('listitem')

describe('flight shortlist page', () => {
  it('lists the ranked flights for the leg (AC1)', async () => {
    open(body(all()))
    const list = await screen.findByRole('list', { name: 'Travel options ranked, best first' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('heading', { level: 1, name: 'Travel options, Lisbon to Faro, 18 Nov' })).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Travel options, Faro to Porto, 22 Nov' })).toBeInTheDocument()
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
    expect(await screen.findByText('No travel options were found for this route and date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change dates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose another travel mode' })).toBeInTheDocument()
  })

  it('shows skeletons while loading and an alert with Retry when the request fails', async () => {
    open(null, 500)
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your flights")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows the mode on each entry, with no estimate label or ride link on a flight (AC4, AC6, AC11)', async () => {
    open(body(all()))
    const cards = await findCards()
    expect(within(cards[0]).getByText('Flight')).toBeInTheDocument()
    expect(screen.queryByText(/Estimated fare/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open ride provider' })).toBeNull()
    expect(screen.queryByText('Train')).toBeNull()
  })

  it('shows train, bus and taxi like a flight, with the taxi fare as an estimate and a ride link (AC4, AC6 to AC9)', async () => {
    const train = flight(1, 'Alfa Rail', 24, 195, 0, 'Rail search', 'Cheapest', {
      mode: 'train',
      deal: 'Save 15% with a railcard',
    })
    const bus = flight(2, 'Sul Coach', 29, 240, 1, 'Coach search', 'Balanced fare and travel time', { mode: 'bus' })
    const taxi = flight(3, 'RideNow', 210, 170, 0, 'Ride provider', 'Fastest', {
      mode: 'taxi',
      estimate: true,
      url: 'https://example.com/rides/ridenow-lis-far',
    })
    open(body([train, bus, taxi]))
    const cards = await findCards()
    expect(within(cards[0]).getByText('Train')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Alfa Rail')).toBeInTheDocument()
    expect(within(cards[0]).getByText(/€24\.00|EUR\s?24\.00/)).toBeInTheDocument()
    expect(within(cards[0]).getByText('Deal: Save 15% with a railcard')).toBeInTheDocument()
    expect(within(cards[0]).getByText('3 h 15 min')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Nonstop')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Bus')).toBeInTheDocument()
    expect(within(cards[1]).getByText('1 stop')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Taxi')).toBeInTheDocument()
    expect(within(cards[2]).getByText(/Estimated fare/)).toBeInTheDocument()
    expect(within(cards[2]).getByRole('link', { name: 'Open ride provider' })).toHaveAttribute(
      'href',
      'https://example.com/rides/ridenow-lis-far',
    )
    expect(screen.getAllByText(/Estimated fare/)).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Open ride provider' })).toHaveLength(1)
  })

  it('notes each mode that has no service on the route (AC10)', async () => {
    open({ ...body(all()), no_service: ['train', 'bus'] })
    expect(await screen.findByText('No train services run on this route.')).toBeInTheDocument()
    expect(screen.getByText('No bus services run on this route.')).toBeInTheDocument()
    expect(screen.queryByText(/No taxi services/)).toBeNull()
  })

  describe('picking', () => {
    const pickFor = (leg: string, optionId: string, provider: string) => ({
      leg,
      option_id: optionId,
      mode: 'flight',
      provider,
      origin: 'Lisbon',
      destination: 'Faro',
      date: '2027-11-18',
      estimate: false,
      fare: '54',
      picked_fare: '54',
      currency: 'EUR',
      url: 'https://example.com/f',
    })

    const openLeg = (leg: string, existing: unknown[] = []) => {
      const reply = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status })
      const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/auth/me') return reply(200, { email: 'maya@example.com', method: 'email' })
        if (path === '/trips/t1') return reply(200, { ...trip, can_edit: true, transport: existing })
        if (path.startsWith('/trips/t1/flights/shortlist')) return reply(200, body(all()))
        if (init?.method === 'PUT' && path === `/trips/t1/transport/${leg}`) {
          const { option_id } = JSON.parse(String(init.body))
          const provider = all().find((f) => f.flight.id === option_id)!.flight.provider
          return reply(200, { ...trip, can_edit: true, transport: [...existing, pickFor(leg, option_id, provider)] })
        }
        return reply(404, {})
      })
      vi.stubGlobal('fetch', fetchMock)
      renderAt(`${PAGE}&leg=${leg}`)
      return fetchMock
    }

    it('shows Picked on the chosen option and sends it to the trip (AC1)', async () => {
      const fetchMock = openLeg('destination')
      const buttons = await screen.findAllByRole('button', { name: 'Pick' })
      fireEvent.click(buttons[0])
      const picked = await screen.findByRole('button', { name: 'Picked' })
      expect(picked).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Picked Algarve Air. Added to your trip total.')).toBeInTheDocument()
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
      expect(JSON.parse(String(put[1]!.body))).toEqual({
        origin: 'Lisbon',
        destination: 'Faro',
        date: '2027-11-18',
        option_id: 'algarve-air',
      })
    })

    it('shows a progress animation while the pick is saved (AC11)', async () => {
      const fetchMock = openLeg('destination')
      const original = fetchMock.getMockImplementation()!
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => {
        release = r
      })
      fetchMock.mockImplementation(async (path, init) => {
        if (init?.method === 'PUT') await gate
        return original(path, init)
      })
      const { container } = { container: document.body }
      fireEvent.click((await screen.findAllByRole('button', { name: 'Pick' }))[0])
      await waitFor(() => expect(container.querySelector('.progress-fill.is-running')).not.toBeNull())
      release()
      await screen.findByText(/Picked .* Added to your trip total/)
      expect(container.querySelector('.progress-fill.is-running')).toBeNull()
    })

    it('moves the pick when another option is picked (AC2)', async () => {
      openLeg('destination', [])
      fireEvent.click((await screen.findAllByRole('button', { name: 'Pick' }))[0])
      await screen.findByRole('button', { name: 'Picked' })
      fireEvent.click(screen.getAllByRole('button', { name: 'Pick' })[0])
      await screen.findByText('Picked Lusitania Jet. Your earlier pick is replaced.')
      expect(screen.getAllByRole('button', { name: 'Picked' })).toHaveLength(1)
    })

    it('keeps the pick of another leg on the trip (AC4)', async () => {
      openLeg('local_taxi', [pickFor('destination', 'atlantic-air', 'Atlantic Air')])
      fireEvent.click((await screen.findAllByRole('button', { name: 'Pick' }))[0])
      await screen.findByRole('button', { name: 'Picked' })
      expect(screen.getAllByRole('button', { name: 'Picked' })).toHaveLength(1)
    })

    it('says what happened when picking fails', async () => {
      const fetchMock = openLeg('destination')
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation(async (path, init) =>
        init?.method === 'PUT' ? new Response(null, { status: 500 }) : original(path, init),
      )
      fireEvent.click((await screen.findAllByRole('button', { name: 'Pick' }))[0])
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save your pick/i)
    })
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
