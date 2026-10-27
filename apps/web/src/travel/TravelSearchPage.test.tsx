import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const URL_1 = 'local://booking/stay-lisbon-1?start=2027-03-12&end=2027-03-15'
const option = {
  id: 'stay-lisbon-1-x',
  name: 'Lisbon Central Boutique Hotel',
  detail: '3 nights · rated 8.1 of 10 · free cancellation',
  price: '300',
  currency: 'EUR',
  unit: 'total',
  url: URL_1,
}
const searchPath = (type: string, destination: string, depart: string, ret: string, route = '') =>
  `GET /travel-search?${new URLSearchParams({ type, destination, depart, return: ret, route })}`
const stayPath = searchPath('stay', 'Lisbon', '2027-03-12', '2027-03-15')
const found = (source: string, options = [option]) => ({
  status: 200,
  body: { kind: 'stay', source, matched: options.length > 0, options },
})

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const search = async () => fireEvent.click(await screen.findByRole('button', { name: 'Search' }))

describe('travel search page', () => {
  it('lists the options with a Book link for each (AC1)', async () => {
    stubApi({ [stayPath]: found('local') })
    renderAt('/explore/travel')
    await search()
    expect(await screen.findByText('Local mode is on.')).toBeVisible()
    expect(screen.getByText('Lisbon · 12–15 Mar 2027 · Stay')).toBeVisible()
    expect(screen.getByRole('heading', { level: 3, name: option.name })).toBeVisible()
    expect(screen.getByRole('link', { name: `Book ${option.name}` })).toBeVisible()
  })

  it('shows the real-provider warning when local mode is off (AC6)', async () => {
    stubApi({ [stayPath]: found('provider') })
    renderAt('/explore/travel')
    await search()
    expect(await screen.findByText('Local mode is off.')).toBeVisible()
  })

  it('says so and lists nothing when the place cannot be matched (AC3)', async () => {
    stubApi({ [searchPath('stay', 'Nowhere Land', '2027-03-12', '2027-03-15')]: found('local', []) })
    renderAt('/explore/travel')
    await screen.findByLabelText('Destination')
    type('Destination', 'Nowhere Land')
    await search()
    expect(await screen.findByText('No results for this place')).toBeVisible()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('shows a validation message and lists nothing when return is before depart (AC7, AC8)', async () => {
    stubApi({
      [searchPath('stay', 'Lisbon', '2027-03-15', '2027-03-12')]: {
        status: 422,
        body: { code: 'return_before_depart' },
      },
    })
    renderAt('/explore/travel')
    await screen.findByLabelText('Depart')
    type('Depart', '2027-03-15')
    type('Return', '2027-03-12')
    await search()
    expect(await screen.findByText(/Return date is before the departure date/)).toBeVisible()
    expect(screen.getByLabelText('Return')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(screen.queryByText('Search results')).toBeNull()
  })

  it('asks for what is missing only after submit, keeping typed values', async () => {
    stubApi({})
    renderAt('/explore/travel')
    await screen.findByLabelText('Destination')
    type('Destination', '')
    expect(screen.queryByText('Add a destination, like Lisbon.')).toBeNull()
    await search()
    expect(await screen.findByText('Add a destination, like Lisbon.')).toBeVisible()
    expect(screen.getByLabelText('Depart')).toHaveValue('2027-03-12')
  })

  it('needs a route for a flight', async () => {
    stubApi({})
    renderAt('/explore/travel')
    fireEvent.click(await screen.findByRole('tab', { name: 'Flight' }))
    await search()
    expect(await screen.findByText('Add a route, like Porto - Lisbon.')).toBeVisible()
  })

  it('opens the pretend booking page inside the app when Book is activated (AC4)', async () => {
    stubApi({
      [stayPath]: found('local'),
      [`GET /travel-search/booking?${new URLSearchParams({ ref: URL_1 })}`]: {
        status: 200,
        body: { option, kind: 'stay', place: 'Lisbon', number: 1, start: '2027-03-12', end: '2027-03-15' },
      },
    })
    renderAt('/explore/travel')
    await search()
    fireEvent.click(await screen.findByRole('link', { name: `Book ${option.name}` }))
    expect(await screen.findByText('Pretend booking.')).toBeVisible()
    expect(screen.getByText(URL_1)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
  })
})
