import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const BLANK = {
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
  transport_preferences: { modes: [], cabin: null, departure_window: null, max_stops: null, providers: [] },
}

const FULL = {
  display_name: 'Maya',
  home_city: 'Leeds',
  dietary_notes: 'No nuts',
  citizenship: 'Ireland',
  residence: 'France',
  health_status: 'Allergies',
  religion: 'Hindu',
  diet: 'Vegan',
  tastes: ['Food', 'Museums'],
  travel_style: 'Cultural',
  transport_preferences: { modes: [], cabin: null, departure_window: null, max_stops: null, providers: [] },
}

const REQUIRED_ONLY = { ...BLANK, citizenship: 'Ireland', residence: 'France' }

type Fetch = ReturnType<typeof stubApi>
const putCalls = (fetchMock: Fetch) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
const putBody = (fetchMock: Fetch) => JSON.parse(putCalls(fetchMock)[0][1]!.body as string)

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

// The drawer's own options share the answer's text, so wait for it to close before reading the page.
const drawerClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

describe('ProfilePage', () => {
  it('is reached from Account (AC1)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: FULL } })
    renderAt('/account')
    fireEvent.click(await screen.findByRole('link', { name: 'Traveller profile' }))
    expect(await screen.findByRole('heading', { name: 'Traveller profile' })).toBeInTheDocument()
  })

  it('shows all seven saved answers (AC2)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: FULL } })
    renderAt('/profile')
    for (const v of ['Ireland', 'France', 'Allergies', 'Hindu', 'Vegan', 'Food, Museums', 'Cultural'])
      expect(await screen.findByText(v)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Change / })).toHaveLength(7)
  })

  it.each([
    ['health_status', 'Change health status', 'Health status', 'Mobility needs'],
    ['religion', 'Change religion', 'Religion', 'Sikh'],
    ['diet', 'Change diet', 'Diet', 'Vegetarian'],
    ['travel_style', 'Change travel style', 'Travel style', 'Luxury'],
    ['citizenship', 'Change citizenship', 'Citizenship', 'Japan'],
  ])('changes a saved %s answer and keeps the rest (AC3)', async (key, button, label, next) => {
    const fetchMock = stubWithPut(FULL)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: button }))
    fireEvent.change(screen.getByLabelText(label), { target: { value: next } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await drawerClosed()
    expect(screen.getByText(next)).toBeInTheDocument()
    expect(putBody(fetchMock)).toEqual({ ...FULL, [key]: next })
  })

  it('changes saved tastes (AC3)', async () => {
    const fetchMock = stubWithPut(FULL)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Change tastes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Museums' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await drawerClosed()
    expect(screen.getByText('Food, Nature')).toBeInTheDocument()
    expect(putBody(fetchMock)).toEqual({ ...FULL, tastes: ['Food', 'Nature'] })
  })

  it('adds a skipped answer (AC4)', async () => {
    const fetchMock = stubWithPut(REQUIRED_ONLY)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer for religion' }))
    fireEvent.change(screen.getByLabelText('Religion'), { target: { value: 'Buddhist' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await drawerClosed()
    expect(screen.getByText('Buddhist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add answer for religion' })).not.toBeInTheDocument()
    expect(putBody(fetchMock)).toEqual({ ...REQUIRED_ONLY, religion: 'Buddhist' })
  })

  it('adds skipped tastes with a chip (AC4)', async () => {
    stubWithPut(REQUIRED_ONLY)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer for tastes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nightlife' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await drawerClosed()
    expect(screen.getByText('Nightlife')).toBeInTheDocument()
  })

  it('keeps the add drawer open when nothing is chosen (AC4)', async () => {
    const fetchMock = stubWithPut(REQUIRED_ONLY)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer for diet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Choose one to save.')).toBeInTheDocument()
    expect(putCalls(fetchMock)).toHaveLength(0)
  })

  it('shows no companion details and asks for none (AC5)', async () => {
    const fetchMock = stubApi({ 'GET /profile': { status: 200, body: FULL } })
    renderAt('/profile')
    await screen.findByRole('heading', { name: 'Traveller profile' })
    expect(screen.queryByText('Sam')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith('/trips'))).toBe(false)
    expect(screen.getByText(/no companion details are shown here/)).toBeInTheDocument()
  })

  it.each([
    ['citizenship', 'Citizenship', 'Citizenship is required. Choose one to save.'],
    ['residence', 'Residence', 'Residence is required. Choose one to save.'],
  ])('blocks saving a cleared %s (AC6)', async (key, label, message) => {
    const fetchMock = stubWithPut(FULL)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: `Change ${key}` }))
    fireEvent.change(screen.getByLabelText(label), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    expect(putCalls(fetchMock)).toHaveLength(0)
  })

  it('blocks Clear answer on citizenship (AC6)', async () => {
    const fetchMock = stubWithPut(FULL)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Change citizenship' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }))
    expect(
      await screen.findByText('Citizenship is required. Choose one to save.'),
    ).toBeInTheDocument()
    expect(putCalls(fetchMock)).toHaveLength(0)
  })

  it('clears an optional answer back to Add answer', async () => {
    const fetchMock = stubWithPut(FULL)
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Change religion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }))
    expect(
      await screen.findByRole('button', { name: 'Add answer for religion' }),
    ).toBeInTheDocument()
    expect(putBody(fetchMock)).toEqual({ ...FULL, religion: '' })
  })

  it.each([
    ['health_status', 'Health status'],
    ['religion', 'Religion'],
    ['diet', 'Diet'],
    ['tastes', 'Tastes'],
    ['travel_style', 'Travel style'],
  ])('shows skipped %s as an empty field with Add answer (AC7)', async (key, label) => {
    // A profile saved before set-up existed has the field missing altogether.
    const { [key]: _skipped, ...older } = REQUIRED_ONLY as Record<string, unknown>
    stubApi({ 'GET /profile': { status: 200, body: older } })
    renderAt('/profile')
    expect(await screen.findByRole('combobox', { name: `${label}, not answered` })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: `Add answer for ${label.toLowerCase()}` }),
    ).toBeInTheDocument()
  })

  it('says when the profile cannot be loaded', async () => {
    stubApi({ 'GET /profile': { status: 500 } })
    renderAt('/profile')
    expect(
      await screen.findByText("We couldn't load your profile. Reload to try again."),
    ).toBeInTheDocument()
  })

  it('keeps the drawer open and the value when saving fails', async () => {
    stubApi({ 'GET /profile': { status: 200, body: FULL }, 'PUT /profile': { status: 500 } })
    renderAt('/profile')
    fireEvent.click(await screen.findByRole('button', { name: 'Change diet' }))
    fireEvent.change(screen.getByLabelText('Diet'), { target: { value: 'Halal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("We couldn't save that answer. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('Diet changed to Halal.')).not.toBeInTheDocument()
  })
})
