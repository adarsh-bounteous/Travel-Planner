import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Amenity, Shortlist, ShortlistStay, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = {
  id: 't1',
  name: 'Iberia',
  stays: [{ id: 's1', place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05' }],
}

const ALL: Amenity[] = ['wifi', 'breakfast', 'parking', 'pool', 'ac']

const row = (
  rank: number,
  name: string,
  nightly: number,
  fit: number,
  amenities: number,
  over = 0,
): ShortlistStay => ({
  rank,
  property: {
    id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    property_type: 'hotel',
    rooms: 1,
    stars: 4,
    area: 'Baixa',
    amenities: ALL.slice(0, amenities),
    nearby: false,
    offers: [
      {
        provider: 'Booknest',
        price_per_night: String(nightly),
        total: String(nightly * 4),
        currency: 'EUR',
        fetched_at: '2026-01-01T10:42:00Z',
        url: 'https://example.com',
      },
    ],
  },
  total: String(nightly * 4),
  currency: 'EUR',
  fits_budget: over === 0,
  over_budget_by: String(over),
  fit,
  reason: rank === 1 ? 'Best overall' : rank === 2 ? 'Best match' : rank === 3 ? 'Best price' : 'Best offers',
  why: `Why ${rank}`,
})

const shortlist = (stays: ShortlistStay[]): Shortlist => ({
  place: 'Lisbon',
  start_date: '2027-01-01',
  end_date: '2027-01-05',
  nights: 4,
  budget: '550',
  currency: 'EUR',
  stays,
})

const five = shortlist([
  row(1, 'Hotel Alfama Terrace', 118, 92, 3),
  row(2, 'Casa do Miradouro', 74, 84, 2),
  row(3, 'Pensão Rossio', 62, 68, 1),
  row(4, 'Baixa Grand Hotel', 209, 88, 5, 286),
  row(5, 'Lisbon Riverside Suites', 255, 75, 4, 470),
])

const URL = '/trips/t1/stays/s1/shortlist?property_type=hotel&rooms=1'
const open = (body: Shortlist | null, status = 200) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    [`GET ${URL}`]: body ? { status, body } : { status },
  })
  renderAt('/trips/t1/stays/s1/shortlist')
  return fetchMock
}

describe('stay shortlist page', () => {
  it('groups budget-fitting stays above over-budget ones, each with a reason (AC1 to AC3)', async () => {
    open(five)
    expect(await screen.findByRole('heading', { name: 'Shortlist' })).toBeInTheDocument()
    const fit = within(await screen.findByRole('region', { name: 'Within budget' }))
    const over = within(screen.getByRole('region', { name: 'Over budget' }))
    expect(fit.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Hotel Alfama Terrace, rank 1',
      'Casa do Miradouro, rank 2',
      'Pensão Rossio, rank 3',
    ])
    expect(over.getAllByRole('article')).toHaveLength(2)
    expect(over.getByText('€286 over budget')).toBeInTheDocument()
    expect(screen.getByText('Best overall')).toBeInTheDocument()
    expect(screen.getByText('Why 2')).toBeInTheDocument()
    expect(screen.getByText('Top 5 stays, budget fits first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled()
  })

  it('opens a side-by-side comparison and returns (AC4)', async () => {
    open(five)
    fireEvent.click(await screen.findByRole('button', { name: 'Compare' }))
    expect(await screen.findByRole('heading', { name: 'Compare stays' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getByText('Comparing 5 stays')).toBeInTheDocument()
    expect(screen.getAllByText('Lowest price')).toHaveLength(1)
    expect(screen.getAllByText('Best fit')).toHaveLength(1)
    expect(screen.getAllByText('Most offers')).toHaveLength(1)
    expect(screen.getAllByText(/Preference fit/).length).toBeGreaterThanOrEqual(5)
    expect(screen.getByText('€248')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Back to shortlist/ }))
    expect(await screen.findByRole('heading', { name: 'Shortlist' })).toBeInTheDocument()
  })

  it('disables Compare with an explanation when only one stay matches (AC4)', async () => {
    open(shortlist([row(1, 'Pensão Rossio', 62, 68, 1)]))
    expect(await screen.findByText('1 stay on your shortlist')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(screen.getByText('Only one stay matches.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to stay options' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Over budget' })).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    open(shortlist([]))
    expect(await screen.findByText('No stays to shortlist')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to stay options' })).toBeInTheDocument()
  })

  it('shows skeletons while loading', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: trip },
      [`GET ${URL}`]: { status: 200, body: five },
    })
    const answer = fetchMock.getMockImplementation()!
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    fetchMock.mockImplementation(async (path, init) => {
      if (path.includes('/shortlist')) await gate
      return answer(path, init)
    })
    renderAt('/trips/t1/stays/s1/shortlist')
    const busy = await screen.findByLabelText('Loading shortlist')
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelectorAll('.sk-card')).toHaveLength(3)
    release()
    expect(await screen.findByText('Top 5 stays, budget fits first')).toBeInTheDocument()
  })

  it('shows a retry when the fetch fails', async () => {
    open(null, 500)
    expect(
      await screen.findByText("We couldn't load your shortlist. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
