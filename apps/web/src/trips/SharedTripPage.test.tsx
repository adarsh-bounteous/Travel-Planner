import { act, fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Itinerary, SharedTrip } from './api'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const itinerary: Itinerary = {
  cover: {
    name: 'Lisbon trip',
    start_date: '2027-03-03',
    end_date: '2027-03-04',
    destinations: ['Lisbon'],
  },
  glance: { booked: 1, unbooked: 0 },
  days: [
    {
      number: 1,
      date: '2027-03-03',
      items: [
        {
          kind: 'stay',
          title: 'Hotel Avenida, 2 nights',
          detail: null,
          status: 'booked',
          link_text: null,
          link_url: null,
        },
      ],
    },
  ],
  still_to_schedule: [],
  money: {
    bookings: [
      {
        id: 'b1',
        kind: 'stay',
        name: 'Hotel Avenida',
        provider: null,
        start_date: '2027-03-03',
        end_date: '2027-03-04',
        price: 120,
        currency: 'EUR',
        status: 'confirmed',
        link_url: null,
        outside_trip: false,
      },
    ],
    included: [],
    not_included: [{ name: 'Airport transfer', reason: 'unchosen', add_path: null }],
    standard_exclusions: [],
    cost: {
      currency: 'EUR',
      total: 120,
      by_currency: [{ currency: 'EUR', total: 120 }],
      conversions: [],
      estimates_note: 'Prices are estimates.',
    },
  },
  essentials: [
    {
      key: 'currency',
      label: 'Currency',
      value: 'Euro (EUR)',
      detail: null,
      link_text: null,
      link_url: null,
      source: null,
      as_of: null,
    },
  ],
  checklist: [],
  notes: { price_notice: 'Prices change.', confirm_notice: 'Confirm before you go.', sources: [] },
}

const base: SharedTrip = {
  id: '',
  name: 'Lisbon trip',
  is_owner: false,
  can_edit: false,
  days: [],
  options: [],
  activities: [],
  restaurants: [],
}
const off: SharedTrip = { ...base, itinerary_shared: false, itinerary: null }
const on: SharedTrip = { ...base, itinerary_shared: true, itinerary }

const visit = (body: SharedTrip, token = 'k7Qm2xVd9') => {
  const fetchMock = stubApi({ [`GET /shared/${token}`]: { status: 200, body } }, { signedOut: true })
  renderAt(`/trips/read-only/${token}`)
  return fetchMock
}

describe('read-only trip page', () => {
  it('shows the complete itinerary to a visitor with no account when it is on (AC7)', async () => {
    visit(on)
    for (const name of ['Travel essentials', 'Cost summary', 'Included', 'Day by day']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('Hotel Avenida, 2 nights')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('shows no edit links or controls when it is on (AC8)', async () => {
    visit(on)
    await screen.findByRole('heading', { name: 'Day by day' })
    const main = within(screen.getByRole('main'))
    expect(main.getByText('Read-only')).toBeInTheDocument()
    expect(main.queryByRole('link', { name: /Add to plan|Edit|Explore options/ })).not.toBeInTheDocument()
    expect(main.queryByRole('button')).not.toBeInTheDocument()
    expect(main.queryByRole('tab')).not.toBeInTheDocument()
    expect(main.queryByRole('group', { name: 'Itinerary actions' })).not.toBeInTheDocument()
  })

  it('does not show the itinerary when it was never switched on or is off (AC9, AC10)', async () => {
    visit(off)
    expect(await screen.findByText('The itinerary isn’t shared.')).toBeInTheDocument()
    expect(screen.getByText(/Ask the trip owner if you’d like to see the day-by-day plan/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Lisbon trip' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Day by day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cost summary' })).not.toBeInTheDocument()
  })

  it('shows the unavailable message and no itinerary for a turned-off link', async () => {
    stubApi({ 'GET /shared/dead': { status: 404 } }, { signedOut: true })
    renderAt('/trips/read-only/dead')
    expect(await screen.findByRole('heading', { name: 'Link no longer available' })).toBeInTheDocument()
    expect(screen.getByText(/no longer available\. Ask the trip owner for a new link/)).toBeInTheDocument()
    expect(screen.queryByText('Lisbon trip')).not.toBeInTheDocument()
  })

  it('keeps the itinerary on an open page after the owner switches it off (AC11)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let loads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/auth/me') return new Response(null, { status: 401 })
        return new Response(JSON.stringify(loads++ === 0 ? on : off))
      }),
    )
    renderAt('/trips/read-only/k7Qm2xVd9')
    await screen.findByRole('heading', { name: 'Travel essentials' })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(loads).toBeGreaterThan(1)
    expect(screen.getByRole('heading', { name: 'Travel essentials' })).toBeInTheDocument()
    expect(screen.queryByText('The itinerary isn’t shared.')).not.toBeInTheDocument()
  })

  it('tells an open viewer when the owner turns the link off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let loads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/auth/me') return new Response(null, { status: 401 })
        if (path === '/shared/k7Qm2xVd9' && loads++ === 0) return new Response(JSON.stringify(on))
        return new Response(null, { status: 404 })
      }),
    )
    renderAt('/trips/read-only/k7Qm2xVd9')
    await screen.findByRole('heading', { name: 'Travel essentials' })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    const dialog = await screen.findByRole('alertdialog', { name: 'Access removed' })
    expect(dialog).toHaveTextContent('The owner has turned off this read-only link.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('heading', { name: 'Link no longer available' })).toBeInTheDocument()
    expect(screen.queryByText('Hotel Avenida, 2 nights')).not.toBeInTheDocument()
  })
})
