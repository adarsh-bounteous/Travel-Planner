import { act, fireEvent, screen } from '@testing-library/react'
import { renderAt } from '../test-api'
import type { Trip } from './api'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  is_owner: false,
  can_edit: true,
  days: [{ date: '2027-03-03', name: 'Day 1' }],
  activities: [],
  ...overrides,
})

/** GET /trips/t1 answers with the trip once, then 404 when `revoked`; everything else answers 404. */
const stub = (loaded: Trip, revoked = true) => {
  let loads = 0
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/auth/me')
      return new Response(JSON.stringify({ email: 'ana@example.com', method: 'email' }))
    if (path === '/trips/t1' && init?.method === 'GET' && (loads++ === 0 || !revoked))
      return new Response(JSON.stringify(loaded))
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const getsOfTrip = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls.filter(([p, i]) => p === '/trips/t1' && i?.method === 'GET')

describe('access removed', () => {
  it('tells an editor on the next background refetch (AC13)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stub(trip())
    renderAt('/trips/t1')
    await screen.findByRole('heading', { name: 'Lisbon' })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    const dialog = await screen.findByRole('alertdialog', { name: 'Access removed' })
    expect(dialog).toHaveTextContent('Your access to this trip was removed. Changes were not saved.')
  })

  it('refetches for the owner so the trip total stays current, without an access dialog', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stub(trip({ is_owner: true }), false)
    renderAt('/trips/t1')
    await screen.findByRole('heading', { name: 'Lisbon' })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(getsOfTrip(fetchMock).length).toBeGreaterThan(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows it and saves nothing when a change is refused after revocation (AC14)', async () => {
    stub(trip())
    renderAt('/trips/t1')
    fireEvent.click(await screen.findByRole('button', { name: 'Add activity to Day 1' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Custom activity' }))
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Late' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    expect(await screen.findByRole('alertdialog', { name: 'Access removed' })).toBeInTheDocument()
    expect(screen.queryByText('Late', { selector: 'li *, li' })).toBeNull()
  })
})
