import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const NONE = { modes: [], cabin: null, departure_window: null, max_stops: null, providers: [] }

const profileWith = (transport_preferences: object) => ({
  display_name: 'Maya',
  home_city: 'Leeds',
  dietary_notes: '',
  citizenship: 'Ireland',
  residence: 'France',
  health_status: '',
  religion: '',
  diet: '',
  tastes: [],
  travel_style: '',
  transport_preferences: { ...NONE, ...transport_preferences },
})

// Echo the PUT back, as the API does.
const stubWithPut = (transport_preferences: object) => {
  const fetchMock = stubApi({
    'GET /profile': { status: 200, body: profileWith(transport_preferences) },
  })
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (path: string, init?: RequestInit) =>
    path === '/profile' && init?.method === 'PUT'
      ? new Response(init.body as string, { status: 200 })
      : base(path, init),
  )
  return fetchMock
}

const putBody = (fetchMock: ReturnType<typeof stubApi>) =>
  JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body as string)

const radiosNamed = (name: string) =>
  screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === name)

describe('TransportPreferencesPage', () => {
  it('shows nothing set and asks for nothing when no preferences are saved (AC1)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({}) } })
    renderAt('/profile/transport')
    expect(await screen.findByText('Nothing set yet.')).toBeInTheDocument()
    expect(screen.getAllByText('Not set')).toHaveLength(5)
  })

  it('is reached from Account', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({}) } })
    renderAt('/account')
    fireEvent.click(await screen.findByRole('link', { name: 'Transport preferences' }))
    expect(await screen.findByText('Nothing set yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Transport preferences' })).toBeInTheDocument()
  })

  it('shows a saved mode of train as saved (AC4)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({ modes: ['train'] }) } })
    renderAt('/profile/transport')
    expect(await screen.findByRole('button', { name: 'Train', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Flight', pressed: false })).toBeInTheDocument()
    expect(screen.getByText('Saved: Train')).toBeInTheDocument()
  })

  it('shows a saved cabin class as saved (AC5)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({ cabin: 'economy' }) } })
    renderAt('/profile/transport')
    expect(await screen.findByRole('radio', { name: 'Economy' })).toBeChecked()
    expect(screen.getByText('Saved: Economy')).toBeInTheDocument()
  })

  it('shows a saved departure window as saved (AC6)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({ departure_window: 'morning' }) } })
    renderAt('/profile/transport')
    expect(await screen.findByRole('radio', { name: 'Morning' })).toBeChecked()
    expect(screen.getByText('Saved: Morning')).toBeInTheDocument()
  })

  it('shows a saved maximum number of stops as saved (AC7)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({ max_stops: 1 }) } })
    renderAt('/profile/transport')
    expect(await screen.findByRole('radio', { name: '1 stop' })).toBeChecked()
    expect(screen.getByText('Saved: 1 stop')).toBeInTheDocument()
  })

  it('shows a saved custom number of stops in the number input (AC7)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({ max_stops: 3 }) } })
    renderAt('/profile/transport')
    expect(await screen.findByText('Saved: 3 stops')).toBeInTheDocument()
    expect(screen.getByLabelText('Or enter another number')).toHaveValue(3)
    expect(radiosNamed('stops').some((r) => (r as HTMLInputElement).checked)).toBe(false)
  })

  it('shows a saved provider and rejects a duplicate ignoring case (AC8)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({ providers: ['Example Air'] }) } })
    renderAt('/profile/transport')
    expect(await screen.findByText('Example Air')).toBeInTheDocument()
    expect(screen.getByText('Saved: Example Air')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Add a provider'), { target: { value: 'example air' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already in your list')
    expect(screen.getByLabelText('Add a provider')).toHaveValue('example air')
  })

  it('offers exactly 0, 1 and 2 stops as choices (AC10)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({}) } })
    renderAt('/profile/transport')
    await screen.findByText('Nothing set yet.')
    expect(radiosNamed('stops').map((r) => r.getAttribute('value'))).toEqual(['0', '1', '2'])
  })

  it('offers exactly morning, afternoon, evening and night (AC11)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith({}) } })
    renderAt('/profile/transport')
    await screen.findByText('Nothing set yet.')
    expect(radiosNamed('window').map((r) => r.getAttribute('value'))).toEqual([
      'morning',
      'afternoon',
      'evening',
      'night',
    ])
  })

  it('saves any whole number of stops typed in, keeping the rest of the profile', async () => {
    const fetchMock = stubWithPut({ modes: ['train'] })
    renderAt('/profile/transport')
    fireEvent.change(await screen.findByLabelText('Or enter another number'), { target: { value: '4' } })
    expect(screen.getByText('Unsaved change')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Transport preferences saved.')).toBeInTheDocument()
    const body = putBody(fetchMock)
    expect(body.transport_preferences.max_stops).toBe(4)
    expect(body.transport_preferences.modes).toEqual(['train'])
    expect(body.citizenship).toBe('Ireland')
    expect(screen.getByText('Saved: 4 stops')).toBeInTheDocument()
  })

  it('refuses a stops value that is not a whole number from 0 to 10', async () => {
    const fetchMock = stubWithPut({})
    renderAt('/profile/transport')
    fireEvent.change(await screen.findByLabelText('Or enter another number'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a whole number from 0 to 10.')).toBeInTheDocument()
    expect(screen.getByLabelText('Or enter another number')).toHaveClass('is-invalid')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('saves a chosen mode, class, window and provider, and clears a row', async () => {
    const fetchMock = stubWithPut({ cabin: 'business' })
    renderAt('/profile/transport')
    fireEvent.click(await screen.findByRole('button', { name: 'Bus' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Evening' }))
    fireEvent.click(screen.getByRole('radio', { name: '0 stops' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear class' }))
    fireEvent.change(screen.getByLabelText('Add a provider'), { target: { value: ' Costa Coach ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Transport preferences saved.')).toBeInTheDocument())
    expect(putBody(fetchMock).transport_preferences).toEqual({
      modes: ['bus'],
      cabin: null,
      departure_window: 'evening',
      max_stops: 0,
      providers: ['Costa Coach'],
    })
  })

  it('says so when a load fails', async () => {
    stubApi({})
    renderAt('/profile/transport')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your preferences")
  })
})
