import { act, fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { CostSummary, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip = (overrides: Partial<Trip> = {}): Trip => {
  const made = baseTrip(overrides)
  return { cost: costFor(made), ...made, ...overrides }
}

// The server sends the cost summary; with no priced options the total is 0.
const costFor = (t: Trip): CostSummary => ({
  currency: 'EUR',
  total: 0,
  budget: t.budget ?? null,
  over_budget_by: 0,
  missing_categories: [],
  unpriced_count: 0,
  unconvertible_count: 0,
  rates: [],
})

const baseTrip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  start_date: '2027-03-03',
  end_date: '2027-03-05',
  budget: 1500,
  currency: 'EUR',
  is_owner: true,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
    { date: '2027-03-05', name: 'Day 3' },
  ],
  options: [
    { id: 'o1', title: 'Tram pass', category: 'Conveyance', date: '2027-03-03' },
    { id: 'o2', title: 'Belém Tower tickets', category: 'Attractions', date: '2027-03-04' },
  ],
  ...overrides,
})

const open = (t: Trip = trip()) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: t },
    'GET /trips': { status: 200, body: [] },
  })
  renderAt('/trips/t1')
  return fetchMock
}

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)

const openSettings = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit trip' }))
  return screen.findByRole('dialog', { name: 'Trip settings' })
}

describe('TripDetailPage itinerary', () => {
  it('opens on the Itinerary tab with one stack per day, in date order (AC1, AC2)', async () => {
    open(trip({ is_owner: false }))
    expect(await screen.findByRole('tab', { name: 'Itinerary', selected: true })).toBeVisible()
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toHaveLength(3)
    expect(headings[0]).toMatch(/^3 March/)
    expect(headings[1]).toMatch(/^4 March/)
    expect(headings[2]).toMatch(/^5 March/)
  })

  it("shows only each day's own options (AC3, AC4)", async () => {
    open()
    const day3 = within(await screen.findByRole('region', { name: /3 March/ }))
    expect(day3.getByText('Tram pass')).toBeInTheDocument()
    expect(day3.queryByText('Belém Tower tickets')).not.toBeInTheDocument()
    const day4 = within(screen.getByRole('region', { name: /4 March/ }))
    expect(day4.getByText('Belém Tower tickets')).toBeInTheDocument()
    expect(day4.queryByText('Tram pass')).not.toBeInTheDocument()
  })

  it('shows an empty stack with its date for a day with no options (AC20)', async () => {
    open()
    const day5 = within(await screen.findByRole('region', { name: /5 March/ }))
    expect(day5.getByText('Nothing chosen for this day yet')).toBeInTheDocument()
  })

  it('shows the budget with its currency', async () => {
    open()
    expect(await screen.findByText('Budget 1,500 EUR')).toBeInTheDocument()
  })

  it('shows the trip total with its currency code (AC7)', async () => {
    open(trip({ cost: { ...costFor(trip()), total: 200 } }))
    expect(await screen.findByRole('heading', { level: 1, name: '200 EUR' })).toBeInTheDocument()
  })

  it.each([
    ['owner', true],
    ['editor', false],
  ])('shows a new over-budget warning without reloading, as the %s (AC12)', async (_who, isOwner) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const within150 = { ...costFor(trip()), budget: 150, total: 140 }
      const over150 = { ...within150, total: 170, over_budget_by: 20 }
      const bodies = [trip({ is_owner: isOwner, cost: within150 }), trip({ is_owner: isOwner, cost: over150 })]
      let reads = 0
      const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/auth/me')
          return new Response(JSON.stringify({ email: 'maya@example.com', method: 'email' }))
        if (path === '/trips/t1' && (init?.method ?? 'GET') === 'GET')
          return new Response(JSON.stringify(bodies[Math.min(reads++, 1)]))
        return new Response(null, { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)
      renderAt('/trips/t1')
      expect(await screen.findByRole('heading', { level: 1, name: '140 EUR' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(30_000))
      expect(await screen.findByRole('alert')).toHaveTextContent('Over budget by 20 EUR')
      expect(reads).toBeGreaterThan(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides every owner control from a non-owner (AC8, AC12)', async () => {
    open(trip({ is_owner: false }))
    await screen.findByRole('tab', { name: 'Itinerary' })
    expect(screen.queryByRole('button', { name: 'Edit trip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rename day/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete trip' })).not.toBeInTheDocument()
  })

  it('shows "Trip not found" for a trip that is not the traveller\'s', async () => {
    stubApi({ 'GET /trips/t1': { status: 404, body: { code: 'not_found' } } })
    renderAt('/trips/t1')
    expect(await screen.findByText('Trip not found')).toBeInTheDocument()
  })
})

describe('TripDetailPage owner edits', () => {
  it('renames the trip and changes the budget from the drawer (AC5, AC7)', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'PUT /trips/t1': { status: 200, body: trip({ name: 'Lisbon Spring', budget: 2000 }) },
    })
    renderAt('/trips/t1')
    const drawer = await openSettings()
    expect(within(drawer).getByLabelText('Trip name')).toHaveValue('Lisbon')
    fireEvent.change(within(drawer).getByLabelText('Trip name'), {
      target: { value: 'Lisbon Spring' },
    })
    fireEvent.change(within(drawer).getByLabelText('Budget (EUR)'), { target: { value: '2000' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lisbon Spring' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Budget 2,000 EUR')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Trip saved')
    const body = JSON.parse(sent(fetchMock, 'PUT')[0][1]!.body as string)
    expect(body).toMatchObject({ name: 'Lisbon Spring', budget: 2000 })
  })

  it('renames a day (AC6)', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'PUT /trips/t1/days/2027-03-03': {
        status: 200,
        body: trip({
          days: [
            { date: '2027-03-03', name: 'Arrival' },
            { date: '2027-03-04', name: 'Day 2' },
            { date: '2027-03-05', name: 'Day 3' },
          ],
        }),
      },
    })
    renderAt('/trips/t1')
    fireEvent.click(await screen.findByRole('button', { name: 'Rename day 1, Day 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename day 1' })
    fireEvent.change(within(dialog).getByLabelText('Day name'), { target: { value: 'Arrival' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Arrival')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Day renamed to Arrival')
  })

  it('refuses a blank day name and sends nothing (AC14)', async () => {
    const fetchMock = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename day 1, Day 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename day 1' })
    fireEvent.change(within(dialog).getByLabelText('Day name'), { target: { value: '   ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Day name can't be blank")
    expect(sent(fetchMock, 'PUT')).toHaveLength(0)
    expect(screen.getAllByText('Day 1').length).toBeGreaterThan(0)
  })

  it('refuses a blank trip name and sends nothing (AC13)', async () => {
    const fetchMock = open()
    const drawer = await openSettings()
    fireEvent.change(within(drawer).getByLabelText('Trip name'), { target: { value: '   ' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent("Trip name can't be blank")
    expect(sent(fetchMock, 'PUT')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 1, name: 'Lisbon' })).toBeInTheDocument()
  })

  it.each([
    ['-5', 'negative budget (AC15)'],
    ['abc', 'non-numeric budget (AC16)'],
  ])('refuses %s as a budget: %s', async (value) => {
    const fetchMock = open()
    const drawer = await openSettings()
    fireEvent.change(within(drawer).getByLabelText('Budget (EUR)'), { target: { value } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent("Budget can't be negative")
    expect(sent(fetchMock, 'PUT')).toHaveLength(0)
    expect(screen.getByText('Budget 1,500 EUR')).toBeInTheDocument()
  })

  it('refuses an end date before the start date', async () => {
    const fetchMock = open()
    const drawer = await openSettings()
    fireEvent.change(within(drawer).getByLabelText('End date'), { target: { value: '2027-03-01' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('end date is before')
    expect(sent(fetchMock, 'PUT')).toHaveLength(0)
  })

  it('shows a message when the server refuses the save (422)', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'PUT /trips/t1': { status: 422, body: { code: 'invalid_dates' } },
    })
    renderAt('/trips/t1')
    const drawer = await openSettings()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent("couldn't save")
  })
})

describe('TripDetailPage delete', () => {
  const askToDelete = async () => {
    const drawer = await openSettings()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Delete trip' }))
    return screen.findByRole('alertdialog')
  }

  it('asks for confirmation and deletes nothing yet (AC9)', async () => {
    const fetchMock = open()
    const dialog = await askToDelete()
    expect(dialog).toHaveTextContent('Delete this trip?')
    expect(dialog).toHaveTextContent('3 days')
    expect(sent(fetchMock, 'DELETE')).toHaveLength(0)
  })

  it('deletes on confirm and lands on Trips with a toast (AC10)', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'DELETE /trips/t1': { status: 204 },
      'GET /trips': { status: 200, body: [] },
    })
    renderAt('/trips/t1')
    const dialog = await askToDelete()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete trip' }))
    expect(await screen.findByText(/You haven't planned a trip yet/)).toBeInTheDocument()
    expect(sent(fetchMock, 'DELETE')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Trip deleted')
  })

  it('keeps the trip on cancel (AC11)', async () => {
    const fetchMock = open()
    const dialog = await askToDelete()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Trip settings' })).toBeInTheDocument()
    expect(sent(fetchMock, 'DELETE')).toHaveLength(0)
  })
})

describe('TripDetailPage book trip', () => {
  const booked = (title: string, id: string) => ({
    id,
    title,
    category: 'Conveyance',
    date: '2027-03-03',
    booking_url: `https://example.com/${id}`,
  })
  const bookButton = () => screen.findByRole('button', { name: 'Book trip' })

  it('disables Book trip when nothing is chosen (AC1)', async () => {
    open(trip({ options: [] }))
    const book = await bookButton()
    expect(book).toBeDisabled()
    expect(book).toHaveAccessibleDescription('Choose an option to enable booking.')
  })

  it('enables Book trip with one chosen option (AC2)', async () => {
    open(trip({ options: [booked('Tram pass', 'o1')] }))
    const book = await bookButton()
    expect(book).toBeEnabled()
    expect(screen.queryByText('Choose an option to enable booking.')).not.toBeInTheDocument()
  })

  it('lists a link for each chosen option and none for an unchosen one (AC3)', async () => {
    open(trip({ options: [booked('Tram pass', 'o1'), booked('Hotel Alfama', 'o2')] }))
    fireEvent.click(await bookButton())
    const list = within(await screen.findByRole('dialog', { name: 'Book trip' }))
    expect(list.getAllByRole('link', { name: /Open booking page/ })).toHaveLength(2)
    expect(list.getByText('Tram pass')).toBeInTheDocument()
    expect(list.queryByText('Time Out Market lunch')).not.toBeInTheDocument()
  })

  it('works for a read-only viewer (AC7, AC8)', async () => {
    open(trip({ is_owner: false, options: [booked('Tram pass', 'o1')] }))
    const book = await bookButton()
    expect(book).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Edit trip' })).not.toBeInTheDocument()
    fireEvent.click(book)
    const link = within(await screen.findByRole('dialog', { name: 'Book trip' })).getByRole('link', {
      name: /Open booking page/,
    })
    expect(link).toHaveAttribute('href', 'https://example.com/o1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('closes on Escape and returns focus to Book trip', async () => {
    open(trip({ options: [booked('Tram pass', 'o1')] }))
    const book = await bookButton()
    book.focus()
    fireEvent.click(book)
    const dialog = await screen.findByRole('dialog', { name: 'Book trip' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(book).toHaveFocus()
  })
})

describe('TripDetailPage share control', () => {
  it('offers Share trip to the owner only (AC7)', async () => {
    open(trip({ is_owner: true }))
    expect(await screen.findByRole('button', { name: 'Share trip' })).toBeInTheDocument()
  })

  it('shows a signed-in non-owner no share control (AC7)', async () => {
    open(trip({ is_owner: false, can_edit: true }))
    await screen.findByRole('heading', { level: 1, name: 'Lisbon' })
    expect(screen.queryByRole('button', { name: 'Share trip' })).not.toBeInTheDocument()
  })
})
