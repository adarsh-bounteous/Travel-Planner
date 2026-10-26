import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const NONE = { modes: [], cabin: null, departure_window: null, max_stops: null, providers: [] }
const SAVED = {
  modes: ['train'],
  cabin: 'business',
  departure_window: 'evening',
  max_stops: 1,
  providers: ['Example Air'],
}

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
  transport_preferences,
})

type Fetch = ReturnType<typeof stubApi>
const putBody = (fetchMock: Fetch) =>
  JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body as string)

// Echo the PUT back, as the API does.
const stubWithPut = (profile: object) => {
  const fetchMock = stubApi({ 'GET /profile': { status: 200, body: profile } })
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (path: string, init?: RequestInit) =>
    path === '/profile' && init?.method === 'PUT'
      ? new Response(init.body as string, { status: 200 })
      : base(path, init),
  )
  return fetchMock
}

const open = async () => {
  renderAt('/profile/transport')
  await screen.findByRole('group', { name: 'Preferred modes' })
}

describe('TransportPreferencesPage', () => {
  it('is reached from Account and starts with nothing set', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith(NONE) } })
    renderAt('/account')
    fireEvent.click(await screen.findByRole('link', { name: 'Transport preferences' }))
    expect(await screen.findByText('Nothing set yet.')).toBeInTheDocument()
    expect(screen.getAllByText('Not set')).toHaveLength(5)
  })

  it('shows each saved preference as saved (AC3)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith(SAVED) } })
    await open()
    expect(screen.getByText('Saved: Train')).toBeInTheDocument()
    expect(screen.getByText('Saved: Business')).toBeInTheDocument()
    expect(screen.getByText('Saved: Evening')).toBeInTheDocument()
    expect(screen.getByText('Saved: 1')).toBeInTheDocument()
    expect(screen.getByText('Saved: Example Air')).toBeInTheDocument()
    expect(screen.getByText('Your preferences are saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Train' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers stops of 0, 1 and 2 (AC4)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith(NONE) } })
    await open()
    const values = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'stops')
    expect(values.map((r) => (r as HTMLInputElement).value)).toEqual(['0', '1', '2'])
  })

  it('offers the windows morning, afternoon, evening and night (AC5)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith(NONE) } })
    await open()
    const values = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'window')
    expect(values.map((r) => (r as HTMLInputElement).value)).toEqual([
      'morning',
      'afternoon',
      'evening',
      'night',
    ])
  })

  it('saves what was chosen, nothing more', async () => {
    const fetchMock = stubWithPut(profileWith(NONE))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Train' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Business' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Evening' }))
    fireEvent.click(screen.getByRole('radio', { name: '1' }))
    fireEvent.change(screen.getByLabelText('Add a provider'), { target: { value: 'Example Air' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }))
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Transport preferences saved.')).toBeInTheDocument()
    expect(putBody(fetchMock)).toEqual(profileWith(SAVED))
    expect(screen.getByText('Saved: Train')).toBeInTheDocument()
  })

  it('takes another stops number and refuses one that is not a whole number up to 10', async () => {
    const fetchMock = stubWithPut(profileWith(NONE))
    await open()
    fireEvent.change(screen.getByLabelText('Or enter another number'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await screen.findByText('Transport preferences saved.')
    expect(putBody(fetchMock).transport_preferences.max_stops).toBe(3)

    fireEvent.change(screen.getByLabelText('Or enter another number'), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Enter a whole number from 0 to 10.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('refuses a provider that is already listed', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith(SAVED) } })
    await open()
    fireEvent.change(screen.getByLabelText('Add a provider'), { target: { value: 'example air' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }))
    expect(
      await screen.findByText('example air is already in your list. Add a different provider.'),
    ).toBeInTheDocument()
  })

  it('removes a provider and clears every preference', async () => {
    const fetchMock = stubWithPut(profileWith(SAVED))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Example Air' }))
    fireEvent.click(screen.getByRole('button', { name: 'Train' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Business' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Evening' }))
    fireEvent.click(screen.getByRole('radio', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Transport preferences cleared.')).toBeInTheDocument()
    expect(putBody(fetchMock).transport_preferences).toEqual(NONE)
    expect(screen.getByText('Nothing set yet.')).toBeInTheDocument()
  })

  it('links back to search', async () => {
    stubApi({ 'GET /profile': { status: 200, body: profileWith(NONE) } })
    await open()
    expect(screen.getByRole('link', { name: 'Back to search' })).toHaveAttribute('href', '/transport')
  })

  it('says so when the profile cannot be loaded', async () => {
    stubApi({ 'GET /profile': { status: 500 } })
    renderAt('/profile/transport')
    await waitFor(() =>
      expect(
        screen.getByText("We couldn't load your preferences. Reload to try again."),
      ).toBeInTheDocument(),
    )
  })

  it('treats a profile saved before this feature as having nothing set', async () => {
    const { transport_preferences: _omitted, ...legacy } = profileWith(NONE)
    stubApi({ 'GET /profile': { status: 200, body: legacy } })
    await open()
    expect(screen.getByText('Nothing set yet.')).toBeInTheDocument()
  })
})
