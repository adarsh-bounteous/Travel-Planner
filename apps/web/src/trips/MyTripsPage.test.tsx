import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const blank = {
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
}
const lisbon = { id: 't1', name: 'Lisbon', destination: 'Portugal' }
const oslo = {
  id: 't2',
  name: 'Oslo',
  destination: 'Norway',
  start_date: '2027-03-04',
  end_date: '2027-03-09',
  shared: true,
}

describe('MyTripsPage entry look', () => {
  it('gives each card a gradient cover, a status badge and the same Open link', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [lisbon, { ...oslo, stays: [{ id: 's' }] }] } })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Lisbon' })
    const container = document.body
    const cards = container.querySelectorAll('li.card')
    expect(container.querySelectorAll('li.card .trip-cover')).toHaveLength(2)
    for (const card of cards) {
      expect(card.querySelector('.badge-success, .badge-neutral')).not.toBeNull()
    }
    expect(cards[0].querySelector('.badge-neutral')).toHaveTextContent('No stays yet')
    expect(cards[1].querySelector('.badge-success')).toHaveTextContent('1 stay')
    expect(screen.getByRole('link', { name: 'Open Lisbon' })).toHaveAttribute('href', '/trips/t1')
  })
})

describe('MyTripsPage destination conversion', () => {
  it('shows the Unmatched flag on a flagged trip in the list', async () => {
    stubApi({
      'GET /trips': {
        status: 200,
        body: [{ id: 't', name: 'Coast', destination: 'Sunny coast', destination_unmatched: true }],
      },
    })
    renderAt('/')
    expect(await screen.findByText('Unmatched')).toBeInTheDocument()
  })

  it('shows Country, Place for a converted trip and no flag', async () => {
    stubApi({
      'GET /trips': {
        status: 200,
        body: [{ id: 't', name: 'Lis', destination: 'Lisbon', country: 'Portugal', place: 'Lisbon' }],
      },
    })
    renderAt('/')
    expect(await screen.findByText('Portugal, Lisbon')).toBeInTheDocument()
    expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()
  })
})

describe('MyTripsPage', () => {
  it('lists own and shared trips together with name, destination, dates (AC1, AC6)', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [lisbon, oslo] } })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Lisbon' })).toBeInTheDocument()
    const row = screen.getByRole('heading', { name: 'Oslo' }).closest('li')!
    expect(within(row).getByText('Norway')).toBeInTheDocument()
    expect(within(row).getByText(/Mar 4, 2027/)).toBeInTheDocument()
    expect(within(row).getByText(/Mar 9, 2027/)).toBeInTheDocument()
  })

  it('shows how many stays each trip has', async () => {
    const stay = { id: 's1', place: 'Porto', start_date: '2027-01-10', end_date: '2027-01-12' }
    stubApi({ 'GET /trips': { status: 200, body: [lisbon, { ...oslo, stays: [stay] }] } })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Lisbon' })
    expect(within(screen.getByRole('heading', { name: 'Lisbon' }).closest('li')!).getByText('No stays yet')).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'Oslo' }).closest('li')!).getByText('1 stay')).toBeInTheDocument()
  })

  it('shows the Shared badge only on shared trips (AC7, AC8)', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [lisbon, oslo] } })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Lisbon' })
    expect(screen.getAllByText('Shared')).toHaveLength(1)
    const row = screen.getByRole('heading', { name: 'Oslo' }).closest('li')!
    expect(within(row).getByText('Shared')).toBeInTheDocument()
  })

  it('opens the trip itinerary from Open (AC2)', async () => {
    stubApi({
      'GET /trips': { status: 200, body: [lisbon] },
      'GET /trips/t1': {
        status: 200,
        body: { ...lisbon, is_owner: true, days: [{ date: '2027-03-03', name: 'Day 1' }] },
      },
    })
    renderAt('/')
    const open = await screen.findByRole('link', { name: 'Open Lisbon' })
    expect(open).toHaveAttribute('href', '/trips/t1')
    fireEvent.click(open)
    expect(await screen.findByRole('tab', { name: 'Itinerary', selected: true })).toBeInTheDocument()
  })

  it('shows the empty state with one Plan your first trip button (AC3)', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [] } })
    renderAt('/')
    expect(await screen.findByText('No trips yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Plan your first trip' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'New trip' })).not.toBeInTheDocument()
  })

  it('launches the guided set-up from Plan your first trip (AC4)', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [] }, 'GET /profile': { status: 200, body: blank } })
    renderAt('/')
    fireEvent.click(await screen.findByRole('link', { name: 'Plan your first trip' }))
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
    expect(screen.getByLabelText('Citizenship')).toBeInTheDocument()
  })

  it('launches the guided set-up from New trip (AC5)', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [lisbon] }, 'GET /profile': { status: 200, body: blank } })
    renderAt('/')
    fireEvent.click(await screen.findByRole('link', { name: 'New trip' }))
    expect(await screen.findByLabelText('Residence')).toBeInTheDocument()
  })

  it('keeps the server order (AC9)', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [oslo, lisbon] } })
    renderAt('/')
    const names = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(names).toEqual(['Oslo', 'Lisbon'])
  })

  it('shows a skeleton while loading (AC10)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path === '/auth/me'
          ? new Response(JSON.stringify({ email: 'maya@example.com', method: 'email' }))
          : new Promise<Response>(() => {}),
      ),
    )
    renderAt('/')
    expect(await screen.findByRole('status', { name: 'Loading trips' })).toBeInTheDocument()
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with Retry, not the empty state, and reloads on Retry (AC11-AC13)', async () => {
    let calls = 0
    const base = stubApi({})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path !== '/trips') return base(path, init)
        calls += 1
        return calls === 1
          ? new Response(null, { status: 500 })
          : new Response(JSON.stringify([lisbon]), { status: 200 })
      }),
    )
    renderAt('/')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your trips")
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Plan your first trip' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Lisbon' })).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  describe('refresh while open', () => {
    const stubSequence = (replies: Response[]) => {
      const base = stubApi({})
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string, init?: RequestInit) =>
          path === '/trips' ? replies.shift()! : base(path, init),
        ),
      )
    }

    it('silently drops a trip whose access was removed (AC14, AC15)', async () => {
      stubSequence([
        new Response(JSON.stringify([lisbon, oslo])),
        new Response(JSON.stringify([lisbon])),
      ])
      renderAt('/')
      await screen.findByRole('heading', { name: 'Oslo' })
      window.dispatchEvent(new Event('focus'))
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Oslo' })).not.toBeInTheDocument(),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText(/removed|no longer/i)).not.toBeInTheDocument()
    })

    it('keeps the list and shows nothing when a refresh fails (AC15)', async () => {
      stubSequence([new Response(JSON.stringify([lisbon, oslo])), new Response(null, { status: 500 })])
      renderAt('/')
      await screen.findByRole('heading', { name: 'Oslo' })
      window.dispatchEvent(new Event('focus'))
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.getByRole('heading', { name: 'Oslo' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
