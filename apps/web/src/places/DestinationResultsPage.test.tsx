import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
      'Belém Tower, not saved',
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
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
  })
})

const putCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([p, i]) => String(p).startsWith('/saved-places') && i?.method === 'PUT')
    .map(([p]) => String(p))

describe('Saving places', () => {
  beforeEach(() => sessionStorage.clear())

  it('Save flips the card to saved (AC1), with no trips (AC4)', async () => {
    const fetchMock = stubApi({
      ...lisbon,
      'GET /saved-places': { status: 200, body: [] },
      'PUT /saved-places/p1': { status: 200, body: alfama },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith('/trips'))).toBe(false)
  })

  it('Unsave flips the card back to not saved (AC2)', async () => {
    stubApi({
      ...lisbon,
      'GET /saved-places': { status: 200, body: [alfama] },
      'DELETE /saved-places/p1': { status: 204 },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    expect(await screen.findByRole('button', { name: 'Save Alfama' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('a saved place then shows on the Saved list (AC3)', async () => {
    let list: unknown[] = []
    const fetchMock = stubApi({
      ...lisbon,
      'PUT /saved-places/p1': { status: 200, body: alfama },
    })
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (path, init) => {
      if (path === '/saved-places' && init?.method === 'GET') return new Response(JSON.stringify(list))
      if (path === '/saved-places/p1') list = [alfama]
      return base(path, init)
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    await screen.findByRole('button', { name: 'Unsave Alfama' })
    fireEvent.click(screen.getByRole('link', { name: 'Saved' }))
    expect(await screen.findByRole('heading', { name: 'Saved' })).toBeInTheDocument()
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
  })

  it('saved and unsaved places have different map markers (AC5)', async () => {
    stubApi({ ...lisbon, 'GET /saved-places': { status: 200, body: [alfama] } })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
    const map = await screen.findByRole('img', { name: 'Map of places' })
    await waitFor(() =>
      expect(
        within(map)
          .getAllByRole('listitem')
          .map((p) => p.getAttribute('data-saved')),
      ).toEqual(['true', 'false']),
    )
    expect(screen.getByText('Saved place')).toBeInTheDocument()
    expect(screen.getByText('Not saved')).toBeInTheDocument()
  })

  it('a signed-out visitor is asked to sign in (AC11)', async () => {
    const fetchMock = stubApi(lisbon, { signedOut: true })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(putCalls(fetchMock)).toEqual([])
    expect(sessionStorage.getItem('returnTo')).toBe('/destinations?q=Lisbon')
  })

  it('a failed save after sign-in alerts and shows no success toast', async () => {
    stubApi(
      {
        ...lisbon,
        'POST /auth/sign-in': { status: 200 },
        'GET /saved-places': { status: 200, body: [] },
        'PUT /saved-places/p1': { status: 500 },
      },
      { signedOut: true },
    )
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'maya@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't update your saved places")
    expect(screen.queryByText('Alfama saved to your account.')).not.toBeInTheDocument()
  })

  it('the place is saved once sign-in completes (AC12)', async () => {
    const fetchMock = stubApi(
      {
        ...lisbon,
        'POST /auth/sign-in': { status: 200 },
        'GET /saved-places': { status: 200, body: [] },
        'PUT /saved-places/p1': { status: 200, body: alfama },
      },
      { signedOut: true },
    )
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'maya@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(putCalls(fetchMock)).toEqual(['/saved-places/p1']))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
    expect(sessionStorage.getItem('pendingSave')).toBeNull()
  })
})

describe('Saving feedback and destination scope', () => {
  beforeEach(() => sessionStorage.clear())

  it('Save sends the place and confirms it (AC1, AC3)', async () => {
    const fetchMock = stubApi({
      ...lisbon,
      'GET /saved-places': { status: 200, body: [] },
      'PUT /saved-places/p1': { status: 200, body: alfama },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByText('Alfama saved to your account.')).toBeInTheDocument()
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')!
    expect(JSON.parse(String(put[1]!.body))).toEqual(alfama)
  })

  it('a failed save alerts and shows no confirmation (AC4)', async () => {
    stubApi({
      ...lisbon,
      'GET /saved-places': { status: 200, body: [] },
      'PUT /saved-places/p1': { status: 500 },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't update your saved places")
    expect(screen.queryByText('Alfama saved to your account.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Alfama' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('a destination param scopes the search and q filters within it (AC6)', async () => {
    const fetchMock = stubApi({
      'GET /places?destination=Lisbon&q=Alfama': { status: 200, body: [alfama] },
      'GET /trips': { status: 200, body: [] },
    })
    renderAt('/destinations?destination=Lisbon&q=Alfama')
    expect(await screen.findByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p]) => String(p) === '/places?destination=Alfama')).toBe(
      false,
    )
  })

  it('a pending save of an already saved place shows a notice and no PUT (AC7, AC8)', async () => {
    const fetchMock = stubApi(
      {
        ...lisbon,
        'POST /auth/sign-in': { status: 200 },
        'GET /saved-places': { status: 200, body: [alfama] },
      },
      { signedOut: true },
    )
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'maya@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Alfama is already saved.')).toBeInTheDocument()
    expect(putCalls(fetchMock)).toEqual([])
  })

  it('Save, Unsave, Save again shows no already-saved notice', async () => {
    stubApi({
      ...lisbon,
      'GET /saved-places': { status: 200, body: [] },
      'PUT /saved-places/p1': { status: 200, body: alfama },
      'DELETE /saved-places/p1': { status: 204 },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    await screen.findByRole('button', { name: 'Unsave Alfama' })
    expect(screen.queryByText('Alfama is already saved.')).not.toBeInTheDocument()
  })
})

describe('Destination results in local mode', () => {
  const kyotoPlace = { ...alfama, id: 'kyoto-bamboo', name: 'Bamboo Path Walk' }
  const local = {
    'GET /startup-status': { status: 200, body: { local_mode: true } },
    'GET /places?destination=Lisbon': { status: 200, body: [alfama, belem] },
    'GET /places?destination=Kyoto': { status: 200, body: [kyotoPlace] },
    'GET /places?destination=Zzyzx': { status: 200, body: [] },
    'GET /trips': { status: 200, body: [] },
    'GET /saved-places': { status: 200, body: [] },
    'PUT /saved-places/p1': { status: 200, body: alfama },
  }

  it('shows the local notice and a generated-locally note (AC1, AC5)', async () => {
    stubApi(local)
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
    expect(screen.getByText(/Local mode is on\. Places are generated here/)).toBeInTheDocument()
    expect(screen.getByText('2 places generated locally for Lisbon.')).toBeInTheDocument()
  })

  it('lists different places for a different destination (AC2)', async () => {
    stubApi(local)
    renderAt('/destinations?q=Kyoto')
    expect(await screen.findByText('Bamboo Path Walk')).toBeInTheDocument()
    expect(screen.queryByText('Alfama')).not.toBeInTheDocument()
  })

  it('shows an empty-results message and no places for an unmatched query (AC3, AC4)', async () => {
    stubApi(local)
    renderAt('/destinations?q=Zzyzx')
    expect(await screen.findByText('No places match your search')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Save / })).toHaveLength(0)
    expect(document.querySelector('ul.grid')).toBeNull()
  })

  it('saves a generated place through the Saved flow (AC6)', async () => {
    const fetchMock = stubApi(local)
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    await waitFor(() => expect(putCalls(fetchMock)).toEqual(['/saved-places/p1']))
  })

  it('says local mode is off when the switch is off (AC7)', async () => {
    stubApi(lisbon)
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
    expect(
      screen.getByText('Local mode is off. Places come from the outside places service.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/generated locally/)).not.toBeInTheDocument()
  })
})

describe('Destination results for a trip', () => {
  const STARTER = { status: 200, body: [{ name: 'Portugal', places: ['Lisbon'] }] }
  const tripWith = (over: object) => ({ status: 200, body: { id: 't1', name: 'Iberia', ...over } })

  it('shows the trip destination label and its places (AC4, AC5)', async () => {
    stubApi({
      ...lisbon,
      'GET /trips/t1': tripWith({ country: 'Portugal', place: 'Lisbon' }),
      'GET /starter-destinations': STARTER,
    })
    renderAt('/destinations?destination=Lisbon&trip=t1')
    expect(await screen.findByText('Destination: Lisbon, Portugal')).toBeInTheDocument()
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
  })

  it('searches the trip place when no destination is in the address (AC4)', async () => {
    stubApi({
      ...lisbon,
      'GET /trips/t1': tripWith({ country: 'Portugal', place: 'Lisbon' }),
      'GET /starter-destinations': STARTER,
    })
    renderAt('/destinations?trip=t1')
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
  })

  it('asks to choose a destination when the trip has none (AC6)', async () => {
    stubApi({ ...lisbon, 'GET /trips/t1': tripWith({}), 'GET /starter-destinations': STARTER })
    renderAt('/destinations?trip=t1')
    expect(await screen.findByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument()
  })

  it('asks to choose a place when the trip has a country only (AC8)', async () => {
    stubApi({ ...lisbon, 'GET /trips/t1': tripWith({ country: 'Portugal' }), 'GET /starter-destinations': STARTER })
    renderAt('/destinations?trip=t1')
    expect(await screen.findByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument()
  })

  it('says there is no information for a country with no data (AC7)', async () => {
    stubApi({
      ...lisbon,
      'GET /trips/t1': tripWith({ country: 'Atlantis', place: 'Lisbon' }),
      'GET /starter-destinations': STARTER,
    })
    renderAt('/destinations?destination=Lisbon&trip=t1')
    expect(await screen.findByText('No information available for this country')).toBeInTheDocument()
  })

  it('says there is no information for a place with no places (AC9)', async () => {
    stubApi({
      'GET /places?destination=Lisbon': { status: 200, body: [] },
      'GET /trips': { status: 200, body: [] },
      'GET /trips/t1': tripWith({ country: 'Portugal', place: 'Lisbon' }),
      'GET /starter-destinations': STARTER,
    })
    renderAt('/destinations?destination=Lisbon&trip=t1')
    expect(await screen.findByText('No information available for this place')).toBeInTheDocument()
    expect(screen.queryByText('No places match your search')).not.toBeInTheDocument()
  })
})
