import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
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
  destination: 'Lisbon, Portugal',
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

const CATALOGUE = {
  'GET /starter-destinations': {
    status: 200,
    body: [
      { name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] },
      { name: 'Portugal', places: ['Lisbon', 'Porto', 'Lagos'] },
    ],
  },
}

const open = (t: Trip = trip()) => {
  const fetchMock = stubApi({
    ...CATALOGUE,
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
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
      .filter((text) => text !== 'Unscheduled')
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
    expect(await screen.findByRole('heading', { level: 2, name: '200 EUR' })).toBeInTheDocument()
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
      expect(await screen.findByRole('heading', { level: 2, name: '140 EUR' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(30_000))
      expect(await screen.findByRole('alert')).toHaveTextContent('Over budget by 20 EUR')
      expect(reads).toBeGreaterThan(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('has a Recommendations tab in the trip sections', async () => {
    open()
    expect(await screen.findByRole('tab', { name: 'Recommendations' })).toBeVisible()
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
      ...CATALOGUE,
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

  it('shows the destination as a dropdown with no free-text field (AC2)', async () => {
    open()
    const drawer = await openSettings()
    const trigger = await within(drawer).findByRole('button', { name: /destination/i })
    expect(trigger).toHaveTextContent('Lisbon, Portugal')
    expect(within(drawer).queryByRole('textbox', { name: 'Destination' })).not.toBeInTheDocument()
  })

  it('saves a changed country and place as the destination (AC8)', async () => {
    const fetchMock = stubApi({
      ...CATALOGUE,
      'GET /trips/t1': { status: 200, body: trip() },
      'PUT /trips/t1': { status: 200, body: trip({ destination: 'Kyoto, Japan', name: 'Kyoto' }) },
    })
    renderAt('/trips/t1')
    const drawer = await openSettings()
    fireEvent.change(await within(drawer).findByLabelText('Country'), { target: { value: 'Japan' } })
    fireEvent.change(within(drawer).getByLabelText('Place'), { target: { value: 'Kyoto' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Kyoto' })).toBeInTheDocument()
    const body = JSON.parse(sent(fetchMock, 'PUT')[0][1]!.body as string)
    expect(body).toMatchObject({ destination: 'Kyoto, Japan' })
  })

  it('does not save when no country and place are chosen (AC11)', async () => {
    const fetchMock = open()
    const drawer = await openSettings()
    fireEvent.change(await within(drawer).findByLabelText('Country'), { target: { value: '' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      'Choose a country and a place.',
    )
    expect(sent(fetchMock, 'PUT')).toHaveLength(0)
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
      ...CATALOGUE,
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
      ...CATALOGUE,
      'DELETE /trips/t1': { status: 204 },
      'GET /trips': { status: 200, body: [] },
    })
    renderAt('/trips/t1')
    const dialog = await askToDelete()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete trip' }))
    expect(await screen.findByText(/No trips yet/)).toBeInTheDocument()
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

  it('enables Book trip with only a local-mode stay chosen', async () => {
    const chosen = {
      property_id: 'p1',
      name: 'Casa Alfama',
      provider: 'Local stays',
      url: 'local://booking/stay-lisbon-1',
      total: '100',
      currency: 'EUR',
    }
    const stay = { id: 's1', place: 'Lisbon', start_date: '2027-03-03', end_date: '2027-03-05', chosen }
    open(trip({ options: [], stays: [stay] }))
    expect(await bookButton()).toBeEnabled()
  })

  it('enables Book trip with only a local-mode transport pick', async () => {
    const pick = {
      leg: 'destination' as const,
      option_id: 'f1',
      mode: 'flight' as const,
      provider: 'Local flights',
      origin: 'Porto',
      destination: 'Lisbon',
      date: '2027-03-03',
      estimate: false,
      fare: '80',
      picked_fare: '80',
      currency: 'EUR',
      url: 'local://booking/flight-lisbon-1',
    }
    open(trip({ options: [], transport: [pick] }))
    expect(await bookButton()).toBeEnabled()
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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

describe('TripDetailPage date change review', () => {
  const stay = { id: 's1', place: 'Lisbon', start_date: '2027-03-01', end_date: '2027-03-02' }
  const redate = async (returned: Trip) => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'PUT /trips/t1': { status: 200, body: returned },
    })
    renderAt('/trips/t1')
    const drawer = await openSettings()
    fireEvent.change(within(drawer).getByLabelText('Start date'), { target: { value: '2027-03-04' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
  }

  it('opens the stays review when a saved date change flags a stay', async () => {
    await redate(trip({ start_date: '2027-03-04', stays: [{ ...stay, outside_trip: true }] }))
    expect(await screen.findByRole('dialog', { name: 'Stays after date change' })).toBeInTheDocument()
  })

  it('shows the Trip saved toast when no stay is flagged', async () => {
    await redate(trip({ start_date: '2027-03-04', stays: [stay] }))
    expect(await screen.findByText('Trip saved')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Stays after date change' })).not.toBeInTheDocument()
  })
})

describe('TripDetailPage unmatched destination', () => {
  it('shows the Unmatched flag and the hint on the detail page', async () => {
    open(trip({ destination: 'Atlantis', destination_unmatched: true }))
    expect(await screen.findByText('Unmatched')).toBeInTheDocument()
    expect(
      screen.getByText("We couldn't match this destination. Edit it to try again."),
    ).toBeInTheDocument()
  })

  it('drops the flag after a save that matches', async () => {
    stubApi({
      ...CATALOGUE,
      'GET /trips/t1': { status: 200, body: trip({ destination: 'Atlantis', destination_unmatched: true }) },
      'PUT /trips/t1': {
        status: 200,
        body: trip({ country: 'Portugal', place: 'Lisbon', destination_unmatched: false }),
      },
    })
    renderAt('/trips/t1')
    const drawer = await openSettings()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Destination saved. Unmatched flag removed.')).toBeInTheDocument()
    expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()
  })
})

// Recorded from the page before the restyle, for an owner of the default trip.
const OWNER_CONTROLS = [
  'Account',
  'Add activity',
  'Add activity',
  'Add activity',
  'Add reminder',
  'Add reminder',
  'Add reminder',
  'Add restaurants',
  'Book trip',
  'Edit trip',
  'Explore',
  'Insurance options',
  'Rename',
  'Rename',
  'Rename',
  'SIM options',
  'Saved',
  'Share trip',
  'Travel Planner',
  'Trips',
  'Trips',
  'View costs in another currency',
  'Visa requirements',
]

describe('TripDetailPage restyle', () => {
  const controls = () =>
    within(document.body)
      .queryAllByRole('button')
      .concat(within(document.body).queryAllByRole('link'))
      .map((e) => e.textContent?.trim())
      .sort()

  it('has no new interactive control for an owner (AC12)', async () => {
    open()
    await screen.findByRole('heading', { level: 1, name: 'Lisbon' })
    expect(controls()).toEqual(OWNER_CONTROLS)
  })

  it('shows a hero with the trip name, dates and destination at the top (AC1, AC11)', async () => {
    open()
    await screen.findByRole('heading', { level: 1, name: 'Lisbon' })
    const hero = document.querySelector('.trip-hero') as HTMLElement
    expect(hero).toBeInTheDocument()
    expect(within(hero).getByRole('heading', { level: 1, name: 'Lisbon' })).toBeInTheDocument()
    expect(hero).toHaveTextContent('Lisbon, Portugal')
    expect(within(hero).queryAllByRole('button')).toHaveLength(0)
    expect(within(hero).queryAllByRole('link')).toHaveLength(0)
  })

  it('puts destination art behind the title and dates, on a scrim, with alt text (AC2, AC7, AC9, AC11)', async () => {
    open()
    await screen.findByRole('heading', { level: 1, name: 'Lisbon' })
    const hero = document.querySelector('.trip-hero .hero') as HTMLElement
    expect(hero).toBeInTheDocument()
    expect(hero.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    expect(hero.querySelector('.scrim')).toHaveAttribute('aria-hidden', 'true')
    expect(within(hero).getByRole('heading', { level: 1, name: 'Lisbon' })).toHaveClass('hero-title')
    await waitFor(() => expect(hero.querySelector('img')?.getAttribute('src')).toMatch(/lisbon\.svg/))
    expect(within(hero).getByRole('img', { name: 'Illustration of Lisbon' })).toBeInTheDocument()
  })

  it('uses the generic art, still with alt text, when the destination has no art (AC13, AC11)', async () => {
    open(trip({ destination: 'Norway' }))
    await screen.findByRole('heading', { level: 1, name: 'Lisbon' })
    const hero = document.querySelector('.trip-hero .hero') as HTMLElement
    await waitFor(() => expect(hero.querySelector('img')?.getAttribute('src')).toMatch(/generic\.svg/))
    expect(within(hero).getByRole('img', { name: 'Neutral illustration of hills and a sun' })).toBeInTheDocument()
  })

  it('shows the tabs below the hero (AC2)', async () => {
    open()
    const tabs = await screen.findByRole('tablist', { name: 'Trip sections' })
    const hero = document.querySelector('.trip-hero')!
    expect(hero.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toContain('Overview')
  })

  it('shows the details as cards (AC3)', async () => {
    open()
    fireEvent.click(await screen.findByRole('tab', { name: 'Overview' }))
    const layout = document.querySelector('.trip-layout')!
    expect(layout.querySelectorAll('.trip-main .card').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Insurance: not yet picked/).closest('.card')).not.toBeNull()
  })

  it('shows the restaurant picks on Overview (AC1)', async () => {
    open(
      trip({
        traveller_count: 1,
        days: [
          { date: '2027-03-03', name: 'Day 1' },
          { date: '2027-03-04', name: 'Day 2' },
        ],
        restaurants: [
          {
            id: 'p1',
            name: 'Time Out Market',
            city: 'Lisbon',
            cuisine: 'Food hall',
            typical_price: '45',
            currency: 'EUR',
            url: null,
            date: '2027-03-04',
            meal: 'dinner',
          },
        ],
      }),
    )
    fireEvent.click(await screen.findByRole('tab', { name: 'Overview' }))
    const card = within(screen.getByRole('region', { name: 'Restaurants' }))
    expect(card.getByText('Time Out Market')).toBeInTheDocument()
    expect(card.getByText(/Day 2, Dinner/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'View shortlist' })).toHaveAttribute(
      'href',
      '/trips/t1/restaurant-options/shortlist',
    )
  })

  it('asks for dates instead of opening a dialog when Schedule is used on a trip without days', async () => {
    open(
      trip({
        days: [],
        restaurants: [
          {
            id: 'p1',
            name: 'Casa Lima',
            city: 'Lisbon',
            cuisine: 'Portuguese',
            typical_price: '19',
            currency: 'EUR',
            url: null,
            date: null,
            meal: null,
          },
        ],
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule Casa Lima' }))
    expect(screen.getByText('Add trip dates first, then you can give this pick a day.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('puts the cost summary after the cards in the DOM (AC4, AC5)', async () => {
    open()
    await screen.findByRole('heading', { level: 1, name: 'Lisbon' })
    const main = document.querySelector('.trip-main')!
    const aside = document.querySelector('.trip-aside') as HTMLElement
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(aside).getByLabelText('Trip total')).toBeInTheDocument()
  })

  it('shows each day as a card holding its activities (AC6, AC7)', async () => {
    open(trip({ activities: [{ id: 'a1', name: 'Oceanarium', date: '2027-03-03' }] }))
    const day = await screen.findByRole('region', { name: /3 March/ })
    expect(day).toHaveClass('card')
    expect(within(day).getByText('Oceanarium')).toBeInTheDocument()
    const dayCards = screen
      .getAllByRole('region')
      .filter((r) => r.classList.contains('card') && /March/.test(r.textContent ?? ''))
    expect(dayCards.length).toBeGreaterThanOrEqual(3)
  })
})

describe('TripDetailPage tab transitions', () => {
  const lefts: Record<string, number> = { 'tab-itinerary': 60, 'tab-stays': 120 }
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get() {
        return lefts[(this as HTMLElement).id] ?? 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return 50
      },
    })
  })
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetLeft
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
  })

  const indicator = () => document.querySelector('.tab-indicator') as HTMLElement

  it('slides the underline to the selected tab (AC3)', async () => {
    open()
    const stays = await screen.findByRole('tab', { name: 'Stays' })
    expect(indicator().style.left).toBe('60px')
    expect(indicator()).not.toHaveClass('is-moving')
    fireEvent.click(stays)
    expect(indicator().style.left).toBe('120px')
    expect(indicator()).toHaveClass('is-moving')
    expect(indicator()).toHaveAttribute('aria-hidden', 'true')
  })

  it('cross-fades the panel and drops the ghost when done (AC4)', async () => {
    open()
    fireEvent.click(await screen.findByRole('tab', { name: 'Stays' }))
    const ghost = document.querySelector('.panel-ghost') as HTMLElement
    expect(ghost).not.toBeNull()
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).toHaveAttribute('inert')
    expect(ghost.querySelectorAll('[id]')).toHaveLength(0)
    expect(ghost).not.toHaveAttribute('id')
    expect(screen.getByRole('tabpanel')).toHaveClass('panel-in')
    fireEvent.animationEnd(screen.getByRole('tabpanel'))
    expect(document.querySelector('.panel-ghost')).toBeNull()
  })

  it('has no ghost on first render', async () => {
    open()
    await screen.findByRole('tab', { name: 'Stays' })
    expect(document.querySelector('.panel-ghost')).toBeNull()
  })

  it('keeps focus and live regions the same on a keyboard tab change (AC8)', async () => {
    open()
    const stays = await screen.findByRole('tab', { name: 'Stays' })
    const liveBefore = document.querySelectorAll('[aria-live]').length
    stays.focus()
    fireEvent.click(stays)
    expect(stays).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-stays')
    expect(document.querySelectorAll('[aria-live]').length).toBe(liveBefore)
    expect(document.querySelectorAll('.tab-indicator [aria-live], .panel-ghost [role="tabpanel"]')).toHaveLength(0)
  })
})
