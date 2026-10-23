import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const lisbon = {
  'GET /places?destination=Lisbon': {
    status: 200,
    body: [
      { id: 'p1', name: 'Alfama', image_url: '/a.jpg' },
      { id: 'p2', name: 'Belém Tower', image_url: '/b.jpg' },
    ],
  },
  'GET /trips': { status: 200, body: [] },
}

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
