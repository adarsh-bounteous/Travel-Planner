import { act, fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Trip } from './api'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const shared: Trip = {
  id: '',
  name: 'Lisbon trip',
  is_owner: false,
  can_edit: false,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
  ],
  options: [
    { id: '', title: 'Hotel Avenida, 2 nights', category: 'Stays', date: '2027-03-03' },
  ],
  activities: [],
  restaurants: [
    {
      id: 'p1',
      name: 'Casa Lima',
      city: 'Lisbon',
      cuisine: 'Portuguese',
      typical_price: '19',
      currency: 'EUR',
      date: null,
      meal: null,
    },
  ],
}

const visit = (token = 'k7Qm2xVd9') => {
  const fetchMock = stubApi(
    { [`GET /shared/${token}`]: { status: 200, body: shared } },
    { signedOut: true },
  )
  renderAt(`/trips/read-only/${token}`)
  return fetchMock
}

describe('read-only trip page', () => {
  it('shows the itinerary to a visitor with no account (AC2)', async () => {
    visit()
    expect(await screen.findByRole('heading', { level: 1, name: 'Lisbon trip' })).toBeInTheDocument()
    expect(screen.getByText('Hotel Avenida, 2 nights')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('lists the restaurant picks by name (AC6)', async () => {
    visit()
    const card = within(await screen.findByRole('region', { name: 'Restaurants' }))
    expect(card.getByText('Casa Lima')).toBeInTheDocument()
  })

  it('shows no control to change the plan (AC3)', async () => {
    visit()
    await screen.findByRole('heading', { level: 1, name: 'Lisbon trip' })
    const main = within(screen.getByRole('main'))
    expect(main.getByText('Read-only')).toBeInTheDocument()
    expect(main.queryByRole('button')).not.toBeInTheDocument()
    expect(main.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('shows the unavailable message and no itinerary for a turned-off link (AC4, AC5)', async () => {
    stubApi({ 'GET /shared/dead': { status: 404 } }, { signedOut: true })
    renderAt('/trips/read-only/dead')
    expect(await screen.findByRole('heading', { name: 'Link no longer available' })).toBeInTheDocument()
    expect(screen.getByText(/no longer available\. Ask the trip owner for a new link/)).toBeInTheDocument()
    expect(screen.queryByText('Lisbon trip')).not.toBeInTheDocument()
    expect(screen.queryByText('Hotel Avenida, 2 nights')).not.toBeInTheDocument()
  })

  it('tells an open viewer when the owner turns the link off (AC6)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let loads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/auth/me') return new Response(null, { status: 401 })
        if (path === '/shared/k7Qm2xVd9' && loads++ === 0) return new Response(JSON.stringify(shared))
        return new Response(null, { status: 404 })
      }),
    )
    renderAt('/trips/read-only/k7Qm2xVd9')
    await screen.findByRole('heading', { name: 'Lisbon trip' })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    const dialog = await screen.findByRole('alertdialog', { name: 'Access removed' })
    expect(dialog).toHaveTextContent('The owner has turned off this read-only link.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('heading', { name: 'Link no longer available' })).toBeInTheDocument()
    expect(screen.queryByText('Hotel Avenida, 2 nights')).not.toBeInTheDocument()
  })
})
