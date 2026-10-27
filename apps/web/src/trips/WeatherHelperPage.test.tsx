import { screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import { formatDate, formatTripDates } from './helperFormat'

afterEach(() => vi.unstubAllGlobals())

const trip = {
  id: 't1',
  name: 'Tokyo',
  destination: 'Tokyo, Japan',
  start_date: '2026-11-03',
  end_date: '2026-11-09',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [],
  travellers: [],
  editors: [],
}
const typical = (month: number) => ({
  month,
  summary: 'Crisp, mostly dry days.',
  high_c: 18,
  low_c: 9,
  rain_mm: 90,
  rain_days: 6,
  as_of: '2026-10-01',
})
const days = [
  { date: '2026-11-03', high_c: 17, low_c: 9, rain_percent: 10 },
  { date: '2026-11-04', high_c: 16, low_c: 8, rain_percent: 20 },
]

const open = (helper: unknown, tripBody = trip) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: tripBody },
    'GET /trips/t1/weather-helper': { status: 200, body: helper },
  })
  renderAt('/trips/t1/weather')
}

describe('Weather helper', () => {
  it('shows typical weather for March with no forecast for a far trip', async () => {
    open(
      { typical: typical(3), forecast: null, start_date: '2027-03-14', end_date: '2027-03-20' },
      { ...trip, start_date: '2027-03-14', end_date: '2027-03-20' },
    )
    expect(await screen.findByRole('heading', { name: 'Typical weather for March' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Forecast for trip dates' })).not.toBeInTheDocument()
    expect(screen.getByText('A forecast appears here once your trip is within 14 days.')).toBeInTheDocument()
  })

  it('shows the forecast for a trip within 14 days, with local dates', async () => {
    open({
      typical: typical(11),
      forecast: { status: 'available', days },
      start_date: '2026-11-03',
      end_date: '2026-11-09',
    })
    expect(await screen.findByRole('heading', { name: 'Forecast for trip dates' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(
      screen.getByText(`Tokyo, Japan, ${formatTripDates('2026-11-03', '2026-11-09')}`),
    ).toBeInTheDocument()
  })

  it('says the forecast is unavailable and shows dated typical weather instead', async () => {
    open({
      typical: typical(11),
      forecast: { status: 'unavailable', days: [] },
      start_date: '2026-11-03',
      end_date: '2026-11-09',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('The forecast is unavailable right now.')
    expect(screen.getByRole('heading', { name: `Typical weather for November, dated ${formatDate('2026-10-01')}` })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Forecast for trip dates' })).not.toBeInTheDocument()
  })
})
