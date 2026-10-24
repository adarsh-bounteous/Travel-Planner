import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const alfama = {
  id: 'p1',
  name: 'Alfama',
  image_url: '/a.jpg',
  place_type: 'landmark',
  price: 'free',
  lat: 38.711,
  lng: -9.13,
}
const belem = {
  id: 'p2',
  name: 'Belém Tower',
  image_url: '/b.jpg',
  place_type: 'museum',
  price: 'budget',
  lat: 38.6916,
  lng: -9.216,
}

const lisbon = {
  'GET /places?destination=Lisbon': { status: 200, body: [alfama, belem] },
  'GET /places?destination=Lisbon&place_type=museum': { status: 200, body: [belem] },
  'GET /places?destination=Lisbon&price=free': { status: 200, body: [alfama] },
  'GET /trips': { status: 200, body: [] },
}

describe('Destination results filters and map', () => {
  it('choosing a place type lists only that type (AC1)', async () => {
    const fetchMock = stubApi(lisbon)
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Museum' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Belém Tower')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p]) => String(p).includes('place_type=museum'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Museum' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('choosing a price lists only matching places (AC2)', async () => {
    const fetchMock = stubApi(lisbon)
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Free' }))
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([p]) => String(p).includes('price=free'))).toBe(true)
  })

  it('the map shows exactly the filtered places (AC3, AC5)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon&type=museum')
    await screen.findByText('Belém Tower')
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    const map = await screen.findByRole('img', { name: 'Map of places' })
    expect(within(map).getAllByRole('listitem').map((n) => n.getAttribute('aria-label'))).toEqual([
      'Belém Tower',
    ])
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('img', { name: 'Belém Tower' })).not.toBeInTheDocument()
  })

  it('the list shows the same filtered places after the map (AC4)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon&type=museum&view=map')
    fireEvent.click(await screen.findByRole('tab', { name: 'List' }))
    expect(
      screen.getAllByRole('listitem').map((li) => within(li).getByRole('img').getAttribute('alt')),
    ).toEqual(['Belém Tower'])
  })

  it('the List tab replaces the map with place cards (AC6)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon&view=map')
    expect(await screen.findByRole('img', { name: 'Map of places' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(screen.queryByRole('img', { name: 'Map of places' })).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Alfama' })).toBeInTheDocument()
  })

  it('filters with no match say so (AC7), prompt to change or clear (AC8), and Clear restores', async () => {
    stubApi({
      ...lisbon,
      'GET /places?destination=Lisbon&place_type=park': { status: 200, body: [] },
    })
    renderAt('/destinations?q=Lisbon&type=park')
    expect(await screen.findByText('No places match these filters')).toBeInTheDocument()
    expect(screen.getByText('Change or clear the filters to see more places.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Park' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
  })
})

describe('Destination results', () => {
  it('searching from Home shows results for the destination (AC1)', async () => {
    stubApi(lisbon)
    renderAt('/')
    fireEvent.change(await screen.findByLabelText('Search a city or place'), {
      target: { value: ' Lisbon ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
  })

  it('a blank search stays on Home and makes no places call', async () => {
    const fetchMock = stubApi(lisbon)
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Enter a city or place to search.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where to next?' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith('/places'))).toBe(false)
  })

  it('shows the places as a list of cards (AC2)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
  })

  it('Back returns to Home (AC3)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument()
  })

  it('each card shows the image and name (AC4)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByRole('img', { name: 'Alfama' })).toHaveAttribute('src', '/a.jpg')
    expect(screen.getByText('Alfama')).toBeInTheDocument()
  })

  it('an empty result says no places match (AC5) and prompts a new search (AC6)', async () => {
    stubApi({ 'GET /places?destination=Zzz': { status: 200, body: [] } })
    renderAt('/destinations?q=Zzz')
    expect(await screen.findByText('No places match your search')).toBeInTheDocument()
    expect(screen.getByText('Try a different city or place.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change search' })).toHaveAttribute('href', '/')
  })

  it('shows a skeleton while loading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path === '/auth/me'
          ? new Response(JSON.stringify({ email: 'maya@example.com', method: 'email' }), {
              status: 200,
            })
          : new Promise<Response>(() => {}),
      ),
    )
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByRole('status', { name: 'Loading places' })).toBeInTheDocument()
  })

  it('shows an alert when the request fails', async () => {
    stubApi({ 'GET /places?destination=Lisbon': { status: 500 } })
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load places.")
  })

  it('redirects to Home without a search', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [] } })
    renderAt('/destinations')
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument()
  })
})
