import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { RestaurantShortlist, ShortlistEntry, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = { id: 't1', name: 'Lisbon trip', destination: 'Lisbon', is_owner: true }

const entry = (
  rank: number,
  name: string,
  price: string | null,
  fits: boolean,
  met: string[] = [],
  cuisine = 'Portuguese',
): ShortlistEntry => ({
  rank,
  restaurant: {
    name,
    city: 'Lisbon',
    cuisine,
    dining_style: 'Casual',
    price_level: 2,
    typical_price: price,
    currency: 'EUR',
    suits: [],
    url: null,
  },
  fits_budget: fits,
  preferences_met: met,
  preferences_total: 1,
})

const FIVE = [
  entry(1, 'Casa Lima', '19', true, ['Portuguese cuisine']),
  entry(2, 'Taberna da Rua Nova', '22', true, ['Portuguese cuisine']),
  entry(3, 'Zaytoon Alfama', '21', true, [], 'Lebanese'),
  entry(4, 'Mesa Real', '68', false, ['Portuguese cuisine']),
  entry(5, 'Peixe Grill', '38', false, ['Portuguese cuisine']),
]

const shortlist = (entries: ShortlistEntry[]): RestaurantShortlist => ({
  place: 'Lisbon',
  budget_per_person: '25',
  currency: 'EUR',
  entries,
})

const open = (view: string, entries: ShortlistEntry[] = FIVE) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/restaurant-shortlist': { status: 200, body: shortlist(entries) },
  })
  renderAt(`/trips/t1/restaurant-options/${view}`)
}

describe('compare tab', () => {
  it('shows every match side by side with cuisine, style and price (AC1, AC5)', async () => {
    open('compare')
    expect(await screen.findAllByRole('article')).toHaveLength(5)
    const casa = screen.getByRole('article', { name: 'Casa Lima' })
    expect(within(casa).getByText('Cuisine:')).toBeInTheDocument()
    expect(within(casa).getByText(/Dining style:/)).toBeInTheDocument()
    expect(within(casa).getByText(/Typical price per person:/)).toBeInTheDocument()
    expect(within(casa).getByText('€19')).toBeInTheDocument()
    expect(screen.getByTestId('comparison')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Choose / })).not.toBeInTheDocument()
  })

  it.each([[[entry(1, 'Casa Lima', '19', true)]], [[]]])(
    'says there is nothing to compare and shows no comparison (AC9, AC10)',
    async (entries) => {
      open('compare', entries)
      expect(await screen.findByRole('heading', { name: 'Nothing to compare' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('fewer than 2 matching restaurants')
      expect(screen.queryByTestId('comparison')).not.toBeInTheDocument()
      expect(screen.queryAllByRole('article')).toHaveLength(0)
      expect(screen.getByRole('link', { name: 'Back to restaurant options' })).toHaveAttribute(
        'href',
        '/trips/t1/restaurant-options',
      )
    },
  )
})

describe('shortlist tab', () => {
  it('lists fitting restaurants first, each with a reason (AC2, AC3)', async () => {
    open('shortlist')
    const entries = await screen.findAllByRole('article')
    expect(entries).toHaveLength(5)
    expect(within(entries[0]).getByText('Within budget')).toBeInTheDocument()
    expect(within(entries.at(-1)!).getByText('Over budget')).toBeInTheDocument()
    entries.forEach((e) => expect(within(e).getByText(/per person, (within|over) your/)).toBeInTheDocument())
    expect(screen.getByText('5 restaurants on your shortlist')).toBeInTheDocument()
  })

  it('removes an entry, undoes it, and offers a restore when all are removed (AC8)', async () => {
    open('shortlist')
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Casa Lima from shortlist' }))
    expect(screen.queryByRole('article', { name: 'Casa Lima' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('article', { name: 'Casa Lima' })).toBeInTheDocument()

    FIVE.forEach((e) =>
      fireEvent.click(screen.getByRole('button', { name: `Remove ${e.restaurant.name} from shortlist` })),
    )
    expect(screen.getByRole('heading', { name: 'Your shortlist is empty' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore shortlist' }))
    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('offers Add to trip on every entry and shows a picked one as added (AC1)', async () => {
    stubApi({
      'GET /trips/t1': {
        status: 200,
        body: {
          ...trip,
          restaurants: [
            { id: 'p1', name: 'Mesa Real', city: 'Lisbon', cuisine: 'Portuguese', typical_price: '68', currency: 'EUR', url: null, date: null, meal: null },
          ],
        },
      },
      'GET /trips/t1/restaurant-shortlist': { status: 200, body: shortlist(FIVE) },
    })
    renderAt('/trips/t1/restaurant-options/shortlist')
    await screen.findAllByRole('article')
    expect(await screen.findByRole('button', { name: 'Added to trip' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Casa Lima to trip' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /^Add .* to trip$/ })).toHaveLength(4)
  })

  it('opens the add dialog from Add to trip (AC1)', async () => {
    open('shortlist')
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Add Casa Lima to trip' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Casa Lima')
  })

  it('shows an entry with no typical price without throwing (AC9)', async () => {
    open('shortlist', [entry(1, 'Cantina Nova', null, true)])
    expect(await screen.findByText(/Typical price not available/)).toBeInTheDocument()
  })

  it('tells the traveller picks are for their group', async () => {
    open('shortlist')
    expect(await screen.findByText(/Add as many as you like/)).toBeInTheDocument()
  })

  it('shows a retryable alert when loading fails', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip } })
    renderAt('/trips/t1/restaurant-options/shortlist')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('redirects an unknown view to the shortlist', async () => {
    open('nonsense')
    expect(await screen.findByRole('heading', { name: 'Restaurant shortlist' })).toBeInTheDocument()
  })
})
