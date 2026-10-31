import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { APP_ROUTE_PATTERNS } from './routePatterns'
import { formatTitle, PAGE_NAMES } from './pageTitle'

afterEach(() => vi.unstubAllGlobals())

function renderAt(url: string, signedIn: boolean, itinerary?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === '/auth/me')
        return signedIn
          ? new Response(JSON.stringify({ id: 'u1', email: 'a@example.com' }))
          : new Response('{}', { status: 401 })
      if (itinerary && String(path).includes('/itinerary')) return new Response(JSON.stringify(itinerary))
      return new Response('[]')
    }),
  )
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('formatTitle', () => {
  it('joins page name and app name (AC8)', () => {
    expect(formatTitle('Sign in')).toBe('Sign in - Travel Planner')
    expect(formatTitle('Lisbon week')).toBe('Lisbon week - Travel Planner')
  })
  it('falls back to the app name (AC9)', () => {
    expect(formatTitle()).toBe('Travel Planner')
    expect(formatTitle(null)).toBe('Travel Planner')
    expect(formatTitle('   ')).toBe('Travel Planner')
  })
})

describe('PAGE_NAMES', () => {
  it('has a decision for every app route', () => {
    const patterns = PAGE_NAMES.map((p) => p.pattern)
    for (const route of APP_ROUTE_PATTERNS) expect(patterns).toContain(route)
  })
})

describe('document title', () => {
  it('names a signed-out page (AC8)', async () => {
    renderAt('/sign-in', false)
    await waitFor(() => expect(document.title).toBe('Sign in - Travel Planner'))
  })

  it('names a signed-in page (AC8)', async () => {
    renderAt('/explore', true)
    await waitFor(() => expect(document.title).toBe('Explore - Travel Planner'))
  })

  it('uses the trip name on the itinerary page (AC8)', async () => {
    renderAt('/trips/t1/itinerary', true, {
      cover: { name: 'Lisbon week', start_date: null, end_date: null, destinations: [] },
      glance: { booked: 0, unbooked: 0 },
      days: [],
      still_to_schedule: [],
    })
    await screen.findByRole('heading', { name: 'Lisbon week' })
    await waitFor(() => expect(document.title).toBe('Lisbon week - Travel Planner'))
  })

  it('is the bare app name on an unknown page, with no stale name (AC9)', async () => {
    const { unmount } = renderAt('/sign-in', false)
    await waitFor(() => expect(document.title).toBe('Sign in - Travel Planner'))
    unmount()
    renderAt('/no/such/page', false)
    await waitFor(() => expect(document.title).toBe('Travel Planner'))
  })
})
