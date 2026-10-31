import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Reply } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const alfama = {
  id: 'p1',
  name: 'Alfama',
  image_url: 'https://img.example/a.jpg',
  place_type: 'landmark',
  price: 'free',
  lat: 38.711,
  lng: -9.13,
}
const belem = { ...alfama, id: 'p2', name: 'Belém Tower', image_url: 'https://img.example/b.jpg' }
const lisbonTrip = { id: 't1', name: 'Lisbon trip' }

const base: Record<string, Reply> = {
  'GET /places?destination=Lisbon': { status: 200, body: [alfama, belem] },
  'GET /saved-places': { status: 200, body: [] },
}

describe('ExplorePage', () => {
  it('shows the heading, the travel link and a place search (AC3)', async () => {
    stubApi(base)
    renderAt('/explore')
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByLabelText('Search places')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search stays, flights and transport' })).toBeInTheDocument()
  })

  it('filters places by name from the search field', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /places?destination=Lisbon&q=Alf': { status: 200, body: [alfama] },
    })
    renderAt('/explore')
    await screen.findByText('Belém Tower')
    fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'Alf' } })
    fireEvent.submit(screen.getByRole('search'))
    await screen.findByText('Alfama')
    expect(screen.queryByText('Belém Tower')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/places?destination=Lisbon&q=Alf', expect.anything())
  })

  it('shows filter chips (AC4)', async () => {
    stubApi(base)
    renderAt('/explore')
    expect(await screen.findByRole('group', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Museum' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows place-type art and loads no photo (AC1, AC2)', async () => {
    stubApi(base)
    renderAt('/explore')
    await waitFor(() => expect(document.querySelectorAll('li.card .imgc')).toHaveLength(2))
    expect(document.querySelector('img[src*="img.example"]')).toBeNull()
  })

  it('toggles between list and map (AC5, AC6)', async () => {
    stubApi(base)
    renderAt('/explore')
    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
    expect(screen.getByRole('img', { name: 'Map of places' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img', { name: 'Map of places' })).toBeNull()
  })

  it('the map shows OSM tiles when tiles are on (AC1)', async () => {
    stubApi({ ...base, 'GET /startup-status': { status: 200, body: { map_tiles: true } } })
    renderAt('/explore?view=map')
    expect((await screen.findAllByTestId('map-tile')).length).toBeGreaterThan(0)
  })

  it('shows save and add-to-trip controls on each card (AC7, AC8)', async () => {
    stubApi(base)
    renderAt('/explore')
    expect(await screen.findByRole('button', { name: 'Save Alfama' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Alfama to trip' })).toBeInTheDocument()
  })

  it('saves a place and confirms (AC13, AC14)', async () => {
    stubApi({ ...base, 'PUT /saved-places/p1': { status: 200, body: alfama } })
    renderAt('/explore')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByText('Alfama saved to your account.')).toBeInTheDocument()
  })

  it('add to trip also saves the place and confirms (AC15, AC16)', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 201, body: { ...lisbonTrip, places: [] } },
      'PUT /saved-places/p1': { status: 200, body: alfama },
    })
    renderAt('/explore')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByText('Place added')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PUT')).toHaveLength(1)
  })

  it('add to trip keeps an already saved place saved', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /saved-places': { status: 200, body: [alfama] },
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 201, body: { ...lisbonTrip, places: [] } },
    })
    renderAt('/explore')
    await screen.findByRole('button', { name: 'Unsave Alfama' })
    fireEvent.click(screen.getByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByText('Place added')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PUT' || i?.method === 'DELETE')).toHaveLength(0)
  })

  it('a failed add does not save the place', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 500 },
    })
    renderAt('/explore')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    await screen.findByText("We couldn't add that place. Try again.")
    expect(screen.getByRole('button', { name: 'Save Alfama' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'PUT')).toHaveLength(0)
  })
})

describe('ExplorePage real places', () => {
  const osmPlace = {
    ...alfama,
    id: 'osm-node-42',
    name: 'Museu X',
    image_url: 'data:image/svg+xml,x',
    place_type: 'museum',
    price: null,
    category: 'museums',
    source: 'osm',
    provider_id: 'node/42',
    url: 'https://www.openstreetmap.org/node/42',
    address: '1 Rua X',
    opening_hours: 'Mo-Fr 09:00-17:00',
  }
  const seedPlace = { ...alfama, source: 'seed', as_of: '2026-10-31' }

  it('credits OpenStreetMap, uses the placeholder cover and shows details (AC3, AC4, AC5)', async () => {
    stubApi({ ...base, 'GET /places?destination=Lisbon': { status: 200, body: [osmPlace] } })
    renderAt('/explore')
    expect(await screen.findByText('Museu X')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /OpenStreetMap contributors/ })).toBeInTheDocument()
    expect(screen.queryByText(/Live data unavailable/)).not.toBeInTheDocument()
    expect(document.querySelectorAll('li.card .imgc')).toHaveLength(1)
    expect(document.querySelector('img[src^="data:image/svg+xml,x"], img[src*="img.example"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details for Museu X' }))
    expect(await screen.findByText('node/42')).toBeInTheDocument()
  })

  it('shows the saved-data notice and no attribution for seed places (AC11, AC13)', async () => {
    stubApi({ ...base, 'GET /places?destination=Lisbon': { status: 200, body: [seedPlace] } })
    renderAt('/explore')
    expect(await screen.findByText(/Live data unavailable, showing saved data/)).toBeInTheDocument()
    expect(screen.queryByText(/OpenStreetMap contributors/)).not.toBeInTheDocument()
  })

  it('filters by category through the API (AC2)', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /places?destination=Lisbon&category=museums': { status: 200, body: [osmPlace] },
    })
    renderAt('/explore')
    await screen.findByText('Belém Tower')
    const group = screen.getByRole('group', { name: 'Category' })
    fireEvent.click(within(group).getByRole('button', { name: 'Museums' }))
    await screen.findByText('Museu X')
    expect(fetchMock).toHaveBeenCalledWith('/places?destination=Lisbon&category=museums', expect.anything())
  })
})
