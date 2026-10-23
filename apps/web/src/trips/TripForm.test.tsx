import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('TripForm', () => {
  it("shows \"Trip not found\" when the trip is not the traveller's (AC6)", async () => {
    stubApi({ 'GET /trips/t1': { status: 404, body: { code: 'not_found' } } })
    renderAt('/trips/t1')
    expect(await screen.findByText('Trip not found')).toBeInTheDocument()
  })

  it('prefills a saved trip and saves a change (AC8)', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: { id: 't1', name: 'Lisbon' } },
      'PUT /trips/t1': { status: 200, body: { id: 't1', name: 'Lisbon 2' } },
      'GET /trips': { status: 200, body: [] },
    })
    renderAt('/trips/t1')
    const name = await screen.findByLabelText('Trip name')
    expect(name).toHaveValue('Lisbon')
    fireEvent.change(name, { target: { value: 'Lisbon 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }))
    await screen.findByText(/You haven't planned a trip yet/)
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(put![1]!.body as string).name).toBe('Lisbon 2')
  })

  it('asks for a trip name before saving', async () => {
    const fetchMock = stubApi({})
    renderAt('/trips/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Save trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a trip name')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
