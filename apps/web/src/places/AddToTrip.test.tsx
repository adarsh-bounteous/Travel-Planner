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

const savedProfile = {
  display_name: '',
  home_city: '',
  dietary_notes: '',
  citizenship: 'Ireland',
  residence: 'Portugal',
  health_status: 'Allergies',
  religion: 'Hindu',
  diet: 'Vegan',
  tastes: ['Food'],
  travel_style: 'Relaxed',
}

const base: Record<string, Reply> = {
  'GET /profile': { status: 200, body: savedProfile },
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
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText('Place added')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const [post] = placesPosts(fetchMock)
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      place_id: 'p1',
      name: 'Alfama',
      image_url: '/a.jpg',
    })
    expect(screen.getByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
  })

  it('shows an error toast, not Place added, when the add fails', async () => {
    stubApi({
      ...base,
      'GET /trips': { status: 200, body: [lisbonTrip] },
      'POST /trips/t1/places': { status: 500 },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    const toast = await screen.findByRole('alert')
    expect(toast.querySelector('.toast-error')).not.toBeNull()
    expect(toast).toHaveTextContent("We couldn't add that place. Try again.")
    expect(within(toast).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(screen.queryByText('Place added')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open trip' })).not.toBeInTheDocument()
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
      'GET /trips/new-id': { status: 200, body: { id: 'new-id', name: 'Lisbon', destination: 'Lisbon' } },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('heading', { name: 'You have no trips yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'New trip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('Trip name')
    expect(placesPosts(fetchMock)).toHaveLength(0)
    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    type('Destination', 'Lisbon')
    type('Start date', '2027-03-12')
    type('End date', '2027-03-15')
    type('Number of travellers', '2')
    type('Budget', '1800')
    type('Trip currency', 'EUR')
    type('Trip name', 'Lisbon')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(placesPosts(fetchMock)).toHaveLength(1))
    expect(JSON.parse(String(placesPosts(fetchMock)[0][1]?.body))).toEqual({
      place_id: 'p1',
      name: 'Alfama',
      image_url: '/a.jpg',
    })
    expect(await screen.findByRole('heading', { name: 'Shortlists' })).toBeInTheDocument()
    expect(screen.queryByText("We couldn't add that place. Try again.")).not.toBeInTheDocument()
  })

  it('still lands on Shortlists when the place cannot be added to the new trip', async () => {
    stubApi({
      ...base,
      'GET /trips': { status: 200, body: [] },
      'POST /trips': { status: 201, body: { id: 'new-id', name: 'Lisbon' } },
      'POST /trips/new-id/places': { status: 500 },
      'GET /trips/new-id': { status: 200, body: { id: 'new-id', name: 'Lisbon', destination: 'Lisbon' } },
    })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    fireEvent.click(await screen.findByRole('link', { name: 'New trip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('Trip name')
    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    type('Destination', 'Lisbon')
    type('Start date', '2027-03-12')
    type('End date', '2027-03-15')
    type('Number of travellers', '2')
    type('Budget', '1800')
    type('Trip currency', 'EUR')
    type('Trip name', 'Lisbon')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByRole('heading', { name: 'Shortlists' })).toBeInTheDocument()
    expect(screen.getByText("We couldn't add that place. Try again.")).toBeInTheDocument()
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
