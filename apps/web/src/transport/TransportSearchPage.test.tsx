import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const option = (over: object) => ({
  id: 'example-air-flight',
  mode: 'flight',
  title: 'Flight - Example Air',
  provider: 'Example Air',
  detail: 'Nonstop, departs 08:05 (morning)',
  stops: 0,
  departs: '08:05:00',
  cabin: 'economy',
  price: '112',
  currency: 'USD',
  estimate: false,
  why: 'Nonstop, morning departure',
  url: 'https://example.com/transport/example-air-flight',
  preferred_provider: false,
  ...over,
})

const RESULT = (options: object[]) => ({
  origin: 'Lisbon',
  destination: 'Madrid',
  date: '2026-11-14',
  options,
})

const SEARCH_PATH = '/transport/options?origin=Lisbon&destination=Madrid&date=2026-11-14'

const profile = (providers: string[], modes: string[] = []) => ({
  display_name: '',
  home_city: '',
  dietary_notes: '',
  citizenship: 'Ireland',
  residence: 'France',
  health_status: '',
  religion: '',
  diet: '',
  tastes: [],
  travel_style: '',
  transport_preferences: { modes, cabin: null, departure_window: null, max_stops: null, providers },
})

const search = async () => {
  fireEvent.change(await screen.findByLabelText('From'), { target: { value: 'Lisbon' } })
  fireEvent.change(screen.getByLabelText('To'), { target: { value: 'Madrid' } })
  fireEvent.change(screen.getByLabelText('Dates'), { target: { value: '2026-11-14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

const findCards = async () =>
  within(await screen.findByRole('list', { name: 'Transport options' })).getAllByRole('listitem')

describe('TransportSearchPage', () => {
  it('asks for no preferences, whether or not any are saved (AC1)', async () => {
    const fetchMock = stubApi({
      'GET /profile': { status: 200, body: profile([], ['train']) },
      [`GET ${SEARCH_PATH}`]: { status: 200, body: RESULT([option({})]) },
    })
    renderAt('/transport')
    await search()
    await findCards()
    for (const label of [/preferred mode/i, /cabin/i, /window/i, /stops/i, /provider/i])
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    const searched = fetchMock.mock.calls.map(([path]) => String(path)).find((p) => p.startsWith('/transport/options'))!
    expect(Array.from(new URL(searched, 'http://x').searchParams.keys())).toEqual([
      'origin',
      'destination',
      'date',
    ])
  })

  it('shows no shortlist before a search', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profile([]) } })
    renderAt('/transport')
    await screen.findByLabelText('From')
    expect(screen.queryByRole('list', { name: 'Transport options' })).not.toBeInTheDocument()
  })

  it('says every option is shown when nothing is saved (AC2)', async () => {
    stubApi({
      'GET /profile': { status: 200, body: profile([]) },
      [`GET ${SEARCH_PATH}`]: {
        status: 200,
        body: RESULT([
          option({}),
          option({ id: 't', mode: 'train', title: 'Train - 1 stop', provider: 'Iberia Rail' }),
          option({ id: 'b', mode: 'bus', title: 'Bus - Costa Coach', provider: 'Costa Coach' }),
        ]),
      },
    })
    renderAt('/transport')
    await search()
    expect(await findCards()).toHaveLength(3)
    expect(screen.getByText('No transport preferences saved. Showing every option.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set transport preferences (optional)' })).toHaveAttribute(
      'href',
      '/profile/transport',
    )
  })

  it('flags a preferred provider and says options are matched to saved preferences (AC6)', async () => {
    stubApi({
      'GET /profile': { status: 200, body: profile(['Example Air'], ['train']) },
      [`GET ${SEARCH_PATH}`]: {
        status: 200,
        body: RESULT([
          option({ preferred_provider: true }),
          option({ id: 't', mode: 'train', title: 'Train - 1 stop', provider: 'Iberia Rail', price: '64' }),
        ]),
      },
    })
    renderAt('/transport')
    await search()
    const cards = await findCards()
    expect(within(cards[0]).getByText('Flight - Example Air')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Preferred provider')).toBeInTheDocument()
    expect(within(cards[1]).queryByText('Preferred provider')).not.toBeInTheDocument()
    expect(screen.getByText('Matched to your saved transport preferences')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit transport preferences' })).toHaveAttribute(
      'href',
      '/profile/transport',
    )
  })

  it('shows price, the reason, an estimate badge and a booking link', async () => {
    stubApi({
      'GET /profile': { status: 200, body: profile([]) },
      [`GET ${SEARCH_PATH}`]: {
        status: 200,
        body: RESULT([
          option({ id: 'x', mode: 'taxi', title: 'Taxi - RideNow', provider: 'RideNow', price: '380', estimate: true, why: 'Door to door' }),
        ]),
      },
    })
    renderAt('/transport')
    await search()
    const [card] = await findCards()
    expect(within(card).getByText('Estimate')).toBeInTheDocument()
    expect(within(card).getByText('US$380')).toBeInTheDocument()
    expect(within(card).getByText(/Why:\s*Door to door/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /View booking/ })).toHaveAttribute(
      'href',
      'https://example.com/transport/example-air-flight',
    )
  })

  it('says so when the search fails', async () => {
    stubApi({
      'GET /profile': { status: 200, body: profile([]) },
      [`GET ${SEARCH_PATH}`]: { status: 500 },
    })
    renderAt('/transport')
    await search()
    expect(
      await screen.findByText('We couldn\'t load transport options. Check the details and search again.'),
    ).toBeInTheDocument()
  })
})
