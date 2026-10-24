import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Reply } from '../test-api'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const alfama = {
  id: 'p1',
  name: 'Alfama',
  image_url: '/a.jpg',
  place_type: 'landmark',
  price: 'free',
  lat: 38.711,
  lng: -9.13,
}
const belem = { ...alfama, id: 'p2', name: 'Belém Tower', image_url: '/b.jpg' }
const lisbonTrip = { id: 't1', name: 'Lisbon trip' }
const romeTrip = { id: 't2', name: 'Rome' }

const base: Record<string, Reply> = {
  'GET /places?destination=Lisbon': { status: 200, body: [alfama, belem] },
}
const placesPosts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([p, init]) => /\/places$/.test(String(p)) && init?.method === 'POST')

describe('Add a place to a trip', () => {
  it('shows an add action on each place card (AC1)', async () => {
    stubApi({ ...base, 'GET /trips': { status: 200, body: [] } })
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findAllByRole('button', { name: /^Add .* to trip$/ })).toHaveLength(2)
  })

  it('adds straight away with one trip and confirms (AC2, 7, 8, 10)', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 201, body: { ...lisbonTrip, places: [] } },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByText('Place added')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const [post] = placesPosts(fetchMock)
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      place_id: 'p1',
      name: 'Alfama',
      image_url: '/a.jpg',
    })
    expect(screen.getByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
  })

  it('asks which trip when there are several (AC3, 4)', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip, romeTrip] },
      'POST /trips/t2/places': { status: 201, body: { ...romeTrip, places: [] } },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a trip' })
    expect(placesPosts(fetchMock)).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Rome' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Rome' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/trips/t2/places', expect.anything()),
    )
    expect(await screen.findByText('Place added')).toBeInTheDocument()
  })

  it('sets up a trip first when there are none (AC5, 6)', async () => {
    const fetchMock = stubApi({
      ...base,
      'GET /trips': { status: 200, body: [] },
      'POST /trips': { status: 201, body: { id: 'new-id', name: 'Lisbon' } },
      'POST /trips/new-id/places': { status: 201, body: { id: 'new-id', name: 'Lisbon' } },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('dialog', { name: 'New trip' })).toBeInTheDocument()
    expect(placesPosts(fetchMock)).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Lisbon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save trip and add place' }))
    await waitFor(() => expect(placesPosts(fetchMock)).toHaveLength(1))
    expect(await screen.findByText('Place added')).toBeInTheDocument()
  })

  it('needs a trip name in the set-up before anything is added (AC5)', async () => {
    const fetchMock = stubApi({ ...base, 'GET /trips': { status: 200, body: [] } })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    await screen.findByRole('dialog', { name: 'New trip' })
    fireEvent.click(screen.getByRole('button', { name: 'Save trip and add place' }))
    expect(await screen.findByText('Enter a trip name to save this trip.')).toBeInTheDocument()
    expect(placesPosts(fetchMock)).toHaveLength(0)
  })

  it('dismisses the confirmation by itself and stays on results (AC9, 10)', async () => {
    stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 201, body: lisbonTrip },
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    await screen.findByText('Place added')
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Place added')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
  })

  it('Open trip shows the trip (AC11)', async () => {
    stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 201, body: lisbonTrip },
      'GET /trips/t1': { status: 200, body: lisbonTrip },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open trip' }))
    expect(await screen.findByRole('heading', { name: 'Lisbon trip' })).toBeInTheDocument()
  })

  it('says so when the place is already on the trip (AC12, 13)', async () => {
    stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 409, body: { code: 'already_on_trip' } },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That place is already on this trip.')
    expect(screen.queryByText('Place added')).not.toBeInTheDocument()
  })

  it('shows an error when the trips cannot be loaded', async () => {
    stubApi(base)
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't add that place. Try again.",
    )
  })
})
