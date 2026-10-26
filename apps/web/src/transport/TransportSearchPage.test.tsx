import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const NONE = { modes: [], cabin: null, departure_window: null, max_stops: null, providers: [] }

const profileWith = (transport_preferences: object) => ({
  display_name: '',
  home_city: '',
  dietary_notes: '',
  citizenship: '',
  residence: '',
  health_status: '',
  religion: '',
  diet: '',
  tastes: [],
  travel_style: '',
  transport_preferences: { ...NONE, ...transport_preferences },
})

const option = (over: object) => ({
  id: 'x',
  mode: 'flight',
  title: 'Flight - Example Air',
  provider: 'Example Air',
  detail: 'Nonstop, departs 08:05 (morning), 1 h 15 min',
  stops: 0,
  departs: '08:05:00',
  cabin: 'economy',
  price: '112',
  currency: 'USD',
  estimate: false,
  why: 'Nonstop, morning departure',
  url: 'https://example.com/transport/x',
  preferred_provider: false,
  ...over,
})

const results = (options: object[]) => ({
  status: 200,
  body: { origin: 'Lisbon', destination: 'Madrid', date: '2026-11-14', options },
})

const SEARCH = 'GET /transport/options?origin=Lisbon&destination=Madrid&date=2026-11-14'

// The traveller fills in the route and dates only; there is no preference field to fill in.
const search = async (to = 'Madrid') => {
  fireEvent.change(await screen.findByLabelText('From'), { target: { value: 'Lisbon' } })
  fireEvent.change(screen.getByLabelText('To'), { target: { value: to } })
  fireEvent.change(screen.getByLabelText('Dates'), { target: { value: '2026-11-14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

const findCards = async () =>
  within(await screen.findByRole('list', { name: 'Transport options' })).getAllByRole('listitem')

describe('TransportSearchPage', () => {
  it('asks for no preferences and says every option is shown when none are saved (AC1, AC3)', async () => {
    stubApi({
      'GET /profile': { status: 200, body: profileWith({}) },
      [SEARCH]: results([
        option({}),
        option({ id: 'bus', mode: 'bus', title: 'Bus - Costa Coach', provider: 'Costa Coach' }),
        option({ id: 'taxi', mode: 'taxi', title: 'Taxi - RideNow', provider: 'RideNow', estimate: true }),
      ]),
    })
    renderAt('/transport')
    expect(
      await screen.findByText('No transport preferences saved. Showing every option.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/cabin|stops|provider|mode/i)).toBeNull()
    await search()
    expect(await findCards()).toHaveLength(3)
    expect(screen.getByText('Estimate')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set transport preferences (optional)' })).toHaveAttribute(
      'href',
      '/profile/transport',
    )
  })

  it('applies saved preferences without asking and flags the preferred provider (AC2, AC9)', async () => {
    stubApi({
      'GET /profile': { status: 200, body: profileWith({ providers: ['Example Air'] }) },
      [SEARCH]: results([
        option({ preferred_provider: true, why: 'Preferred provider, nonstop' }),
        option({ id: 'train', mode: 'train', title: 'Train - 1 stop', provider: 'Iberia Rail', stops: 1 }),
      ]),
    })
    renderAt('/transport')
    expect(await screen.findByText('Matched to your saved transport preferences')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit transport preferences' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/cabin|stops|provider|mode/i)).toBeNull()
    await search()
    const cards = await findCards()
    expect(cards[0]).toHaveTextContent('Flight - Example Air')
    expect(cards[0]).toHaveTextContent('Preferred provider')
    expect(cards[0]).toHaveTextContent('Why: Preferred provider, nonstop')
    expect(cards[0]).toHaveTextContent('$112')
    expect(cards[1]).not.toHaveTextContent('Preferred provider')
    expect(screen.getAllByRole('link', { name: 'View booking' })).toHaveLength(2)
  })

  it('searches again for the typed route', async () => {
    const fetchMock = stubApi({
      'GET /profile': { status: 200, body: profileWith({}) },
      [SEARCH]: results([option({})]),
    })
    renderAt('/transport')
    await search()
    await findCards()
    await search('Porto')
    await screen.findByRole('alert')
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('destination=Porto'))).toBe(true)
  })
})
