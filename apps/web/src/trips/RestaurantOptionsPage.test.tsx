import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { RestaurantOption, RestaurantOptions, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = { id: 't1', name: 'Lisbon trip', destination: 'Lisbon', is_owner: true, dining_needs: ['halal'] }

const restaurant = (name: string, over: Partial<RestaurantOption> = {}): RestaurantOption => ({
  name,
  city: 'Lisbon',
  cuisine: 'Portuguese',
  dining_style: 'Casual',
  price_level: 2,
  typical_price: '22',
  currency: 'EUR',
  suits: ['vegetarian', 'halal'],
  url: 'https://example.com/r',
  ...over,
})

const body = (options: RestaurantOption[], over: Partial<RestaurantOptions> = {}): RestaurantOptions => ({
  place: 'Lisbon',
  home_cuisine: 'Portuguese',
  options,
  filters_applied: { profile: ['Vegetarian', 'Budget: $$'], trip: ['Halal'] },
  ...over,
})

const open = (options: RestaurantOptions, tripBody: Trip = trip, extra = {}) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: tripBody },
    'GET /trips/t1/restaurant-options': { status: 200, body: options },
    'PUT /trips/t1/dining-needs': { status: 200, body: { needs: ['halal', 'kosher'] } },
    ...extra,
  })
  renderAt('/trips/t1/restaurant-options')
  return fetchMock
}

describe('restaurant options page', () => {
  it('shows cards, the home cuisine note and separate filter chip groups', async () => {
    open(body([restaurant('Casa Lima'), restaurant('Zaytoon', { cuisine: 'Lebanese', url: null })]))
    expect(await screen.findByRole('heading', { name: 'Restaurants in Lisbon' })).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Casa Lima' })
    expect(within(card).getByText(/Portuguese cuisine, casual dining. Typically €22 per person./)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /View listing/ })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Zaytoon' })).queryByRole('link')).toBeNull()
    expect(screen.getByText('Portuguese restaurants are listed first.')).toBeInTheDocument()
    expect(screen.getByText('Showing 2 matching restaurants')).toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Filters applied' })
    expect(within(filters).getByText('Vegetarian')).toBeInTheDocument()
    expect(within(filters).getByText('Halal').closest('.chip-trip')).not.toBeNull()
    expect(within(filters).getByText('Vegetarian').closest('.chip-trip')).toBeNull()
  })

  it('says nothing matches and suggests relaxing a filter (AC13, AC14)', async () => {
    open(body([]))
    expect(await screen.findByText('No restaurants match your filters.')).toBeInTheDocument()
    expect(screen.getByText(/Try relaxing a filter/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit trip needs' })).toBeInTheDocument()
  })

  it('shows a skeleton while loading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path === '/auth/me'
          ? new Response(JSON.stringify({ email: 'maya@example.com', method: 'email' }), { status: 200 })
          : new Promise<Response>(() => undefined),
      ),
    )
    renderAt('/trips/t1/restaurant-options')
    await waitFor(() => expect(document.querySelectorAll('.skeleton').length).toBe(9))
  })

  it('shows an alert when loading fails', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip } })
    renderAt('/trips/t1/restaurant-options')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load restaurants/i)
  })

  it('applies trip needs from the drawer, reloads and confirms', async () => {
    const fetchMock = open(body([restaurant('Casa Lima')]))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit trip needs' }))
    expect(screen.getByRole('dialog', { name: 'Dining needs for this trip' })).toBeInTheDocument()
    expect(screen.getByLabelText('Halal')).toBeChecked()
    expect(screen.getByLabelText('Nut-free')).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('Kosher'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('Needs applied to your Lisbon trip')).toBeInTheDocument()
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(put?.[0]).toBe('/trips/t1/dining-needs')
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ needs: ['halal', 'kosher'] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancel does not call the API', async () => {
    const fetchMock = open(body([restaurant('Casa Lima')]))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit trip needs' }))
    fireEvent.click(screen.getByLabelText('Kosher'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('keeps the drawer open with an error when applying fails', async () => {
    open(body([restaurant('Casa Lima')]), trip, { 'PUT /trips/t1/dining-needs': { status: 500 } })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit trip needs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText(/couldn't apply/i)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hides the edit button from an editor', async () => {
    open(body([restaurant('Casa Lima')]), { ...trip, is_owner: false, can_edit: true })
    await screen.findByRole('article', { name: 'Casa Lima' })
    expect(screen.queryByRole('button', { name: 'Edit trip needs' })).toBeNull()
  })
})
