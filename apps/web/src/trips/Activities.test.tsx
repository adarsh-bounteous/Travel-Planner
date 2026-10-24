import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Reply } from '../test-api'
import type { Activity, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const visit: Activity = { id: 'a1', name: 'Belem Tower visit', date: '2027-03-03' }

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  destination: 'Lisbon',
  start_date: '2027-03-03',
  end_date: '2027-03-05',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
    { date: '2027-03-05', name: 'Day 3' },
  ],
  options: [],
  reminders: [],
  activities: [],
  ...overrides,
})

const recs = [
  { id: 'r1', name: 'Tile Museum', detail: 'Museum, about 2 hours' },
  { id: 'r2', name: 'Alfama walking tour', detail: 'Guided walk, about 3 hours' },
]

const open = (t: Trip, extra: Record<string, Reply> = {}) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: t },
    'GET /trips': { status: 200, body: [] },
    'GET /trips/t1/days/2027-03-04/recommendations': { status: 200, body: recs },
    ...extra,
  })
  renderAt('/trips/t1')
  return fetchMock
}

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)

const openDrawer = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'Add activity to Day 2' }))

describe('add activity drawer', () => {
  it('opens for the day with the three ways, recommendations first (AC1, AC2, AC3)', async () => {
    open(trip())
    await openDrawer()
    expect(await screen.findByRole('dialog', { name: 'Add activity to Day 2' })).toBeInTheDocument()
    const tabs = within(screen.getByRole('tablist', { name: 'Ways to add an activity' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['From recommendations', 'Search places', 'Custom activity'])
    expect(screen.getByRole('tab', { name: 'From recommendations' })).toHaveAttribute('aria-selected', 'true')
  })

  it('adds the preselected recommendation with one click (AC6)', async () => {
    const fetchMock = open(trip(), {
      'POST /trips/t1/activities': {
        status: 201,
        body: trip({ activities: [{ id: 'n1', name: 'Tile Museum', date: '2027-03-04' }] }),
      },
    })
    await openDrawer()
    fireEvent.click(await screen.findByRole('button', { name: 'Add Tile Museum' }))
    const day = within(await screen.findByRole('region', { name: /4 March/ }))
    expect(await day.findByText('Tile Museum')).toBeInTheDocument()
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string)).toMatchObject({
      name: 'Tile Museum',
      date: '2027-03-04',
    })
    expect(screen.getByText('Tile Museum added to Day 2.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds a place picked from the search results (AC4)', async () => {
    const fetchMock = open(trip(), {
      'GET /places?destination=Lisbon&q=Bel%C3%A9m': {
        status: 200,
        body: [{ id: 'p1', name: 'Belém Tower', image_url: '/b.jpg' }],
      },
      'POST /trips/t1/activities': {
        status: 201,
        body: trip({ activities: [{ id: 'n1', name: 'Belém Tower', date: '2027-03-04' }] }),
      },
    })
    await openDrawer()
    fireEvent.click(await screen.findByRole('tab', { name: 'Search places' }))
    const input = screen.getByLabelText('Search places')
    fireEvent.change(input, { target: { value: 'Belém' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('radio', { name: /Belém Tower/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Belém Tower' }))
    const day = within(await screen.findByRole('region', { name: /4 March/ }))
    expect(await day.findByText('Belém Tower')).toBeInTheDocument()
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string)).toMatchObject({
      name: 'Belém Tower',
      date: '2027-03-04',
    })
  })

  it('says no places were found and adds nothing (AC11, AC12)', async () => {
    const fetchMock = open(trip(), { 'GET /places?destination=Lisbon&q=xyz': { status: 200, body: [] } })
    await openDrawer()
    fireEvent.click(await screen.findByRole('tab', { name: 'Search places' }))
    const input = screen.getByLabelText('Search places')
    fireEvent.change(input, { target: { value: 'xyz' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/No places were found/)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /^Add / })).toBeNull()
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
  })

  it('saves a custom activity (AC5)', async () => {
    open(trip(), {
      'POST /trips/t1/activities': {
        status: 201,
        body: trip({ activities: [{ id: 'n1', name: 'Cooking class', date: '2027-03-04' }] }),
      },
    })
    await openDrawer()
    fireEvent.click(await screen.findByRole('tab', { name: 'Custom activity' }))
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Cooking class' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    const day = within(await screen.findByRole('region', { name: /4 March/ }))
    expect(await day.findByText('Cooking class')).toBeInTheDocument()
  })

  it('refuses a whitespace-only name and sends nothing (AC9, AC10)', async () => {
    const fetchMock = open(trip())
    await openDrawer()
    fireEvent.click(await screen.findByRole('tab', { name: 'Custom activity' }))
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an activity name to save.')
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
  })

  it('keeps the drawer open when the server fails', async () => {
    open(trip(), { 'POST /trips/t1/activities': { status: 500 } })
    await openDrawer()
    fireEvent.click(await screen.findByRole('tab', { name: 'Custom activity' }))
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Cooking class' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    expect(await screen.findByText("We couldn't add that activity. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('says none are available and still offers the other ways (AC15, AC16)', async () => {
    open(trip(), { 'GET /trips/t1/days/2027-03-04/recommendations': { status: 200, body: [] } })
    await openDrawer()
    expect(await screen.findByText('No recommendations are available for this day.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Search places' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: 'Custom activity' })).toBeEnabled()
  })
})

describe('move and remove', () => {
  const withVisit = () => trip({ activities: [visit] })

  it('moves an activity to another day (AC7)', async () => {
    const fetchMock = open(withVisit(), {
      'PUT /trips/t1/activities/a1': {
        status: 200,
        body: trip({ activities: [{ ...visit, date: '2027-03-04' }] }),
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Move Belem Tower visit' }))
    fireEvent.click(screen.getByRole('button', { name: /4 March/ }))
    expect(
      await within(await screen.findByRole('region', { name: /4 March/ })).findByText('Belem Tower visit'),
    ).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /3 March/ })).queryByText('Belem Tower visit')).toBeNull()
    expect(JSON.parse(sent(fetchMock, 'PUT')[0][1]!.body as string)).toEqual({ date: '2027-03-04' })
  })

  it('asks before removing and keeps the activity (AC13, AC14)', async () => {
    const fetchMock = open(withVisit())
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Belem Tower visit' }))
    expect(screen.getByRole('heading', { name: 'Remove this activity?' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /3 March/ })).getByText('Belem Tower visit')).toBeInTheDocument()
    expect(sent(fetchMock, 'DELETE')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Belem Tower visit')).toBeInTheDocument()
    expect(sent(fetchMock, 'DELETE')).toHaveLength(0)
  })

  it('removes the activity once confirmed (AC8)', async () => {
    open(withVisit(), { 'DELETE /trips/t1/activities/a1': { status: 200, body: trip() } })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Belem Tower visit' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('Belem Tower visit')).toBeNull())
    expect(screen.getByText('Belem Tower visit removed from Day 1.')).toBeInTheDocument()
  })

  it('shows viewers the activities but no controls', async () => {
    open(trip({ activities: [visit], can_edit: false, is_owner: false }))
    expect(await screen.findByText('Belem Tower visit')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add activity|Move|Remove/ })).toBeNull()
  })

  it('still shows the empty day text without options or activities', async () => {
    open(trip())
    expect((await screen.findAllByText('Nothing chosen for this day yet')).length).toBe(3)
  })
})
