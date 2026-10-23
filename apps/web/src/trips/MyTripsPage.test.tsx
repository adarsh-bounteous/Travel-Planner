import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('MyTripsPage', () => {
  it('lists the trips the server returns (AC1)', async () => {
    stubApi({
      'GET /trips': {
        status: 200,
        body: [
          { id: 't1', name: 'Lisbon' },
          { id: 't2', name: 'Oslo', destination: 'Norway' },
        ],
      },
    })
    renderAt('/')
    expect(await screen.findByRole('link', { name: /Lisbon/ })).toHaveAttribute('href', '/trips/t1')
    expect(screen.getByRole('link', { name: /Oslo/ })).toHaveAttribute('href', '/trips/t2')
  })

  it('shows the empty state when there are no trips', async () => {
    stubApi({ 'GET /trips': { status: 200, body: [] } })
    renderAt('/')
    expect(await screen.findByText(/You haven't planned a trip yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New trip' })).toHaveAttribute('href', '/trips/new')
  })

  it('saves a new trip and returns to the list (AC4)', async () => {
    const fetchMock = stubApi({
      'GET /trips': { status: 200, body: [{ id: 't9', name: 'Lisbon' }] },
      'POST /trips': { status: 201, body: { id: 't9', name: 'Lisbon' } },
    })
    renderAt('/trips/new')
    fireEvent.change(await screen.findByLabelText('Trip name'), { target: { value: 'Lisbon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }))
    expect(await screen.findByRole('link', { name: /Lisbon/ })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(post![1]!.body as string).name).toBe('Lisbon')
  })
})
