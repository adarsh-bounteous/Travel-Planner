import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { ChosenSim, SimOption, SimOptions, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = { id: 't1', name: 'Lisbon trip' }

const option = (over: Partial<SimOption> = {}): SimOption => ({
  id: 'roamly-europe-10',
  name: 'Roamly Europe 10 GB',
  provider: 'Web search',
  source: 'web_search',
  sim_type: 'esim',
  countries: ['Portugal', 'Spain'],
  coverage_count: 33,
  valid_from: '2027-03-01',
  valid_to: '2027-03-31',
  data_gb: '10',
  price: '14.50',
  currency: 'EUR',
  traveller_prices: [
    { label: 'Ana', price: '14.50' },
    { label: 'Marco', price: '14.50' },
  ],
  group_total: '29.00',
  url: 'https://roamly.example/europe-10',
  ...over,
})

const chosen: ChosenSim = {
  option_id: 'roamly-europe-10',
  name: 'Roamly Europe 10 GB',
  provider: 'Web search',
  sim_type: 'esim',
  valid_from: '2027-03-01',
  valid_to: '2027-03-10',
  data_gb: '10',
  price: '14.50',
  currency: 'EUR',
  url: 'https://roamly.example/europe-10',
}

const data = (over: Partial<SimOptions> = {}): SimOptions => ({
  place: 'Lisbon, Portugal',
  destination: { country: 'Portugal', place: 'Lisbon', label: 'Lisbon, Portugal' },
  status: 'ready',
  start_date: '2027-03-12',
  end_date: '2027-03-20',
  travellers: ['Ana', 'Marco'],
  preference: null,
  options: [option()],
  picked: null,
  ...over,
})

const open = (body: SimOptions, extra: Parameters<typeof stubApi>[0] = {}) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/sim-options': { status: 200, body },
    ...extra,
  })
  renderAt('/trips/t1/sim-options')
}

describe('SIM options page', () => {
  it('shows the chosen destination label and its country (AC2, AC5)', async () => {
    open(data())
    expect(await screen.findByText('Destination: Lisbon, Portugal')).toBeInTheDocument()
    expect(screen.getByText(/Showing options that cover Portugal/)).toBeInTheDocument()
  })

  it('asks to choose a destination when there is none (AC6)', async () => {
    open(data({ destination: null, status: 'no_destination', options: [] }))
    expect(await screen.findByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument()
    expect(screen.queryByText(/No SIM options match/)).not.toBeInTheDocument()
  })

  it('says there is no information for a country with no data (AC7)', async () => {
    open(data({ status: 'no_country_data', options: [] }))
    expect(await screen.findByText('No information available for this country')).toBeInTheDocument()
    expect(screen.queryByText(/No SIM options match/)).not.toBeInTheDocument()
  })

  it('shows data, price, source and each traveller with the group total (AC5, 6, 18, 19)', async () => {
    open(data())
    expect(await screen.findByText('Data: 10 GB')).toBeInTheDocument()
    expect(screen.getAllByText('€14.50').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ana').length).toBeGreaterThan(0)
    expect(screen.getByText('€29.00')).toBeInTheDocument()
    expect(screen.getAllByText('Group total').length).toBeGreaterThan(0)
    expect(screen.getByText('Web search')).toBeInTheDocument()
    expect(screen.getByText('No SIM preference')).toBeInTheDocument()
  })

  it('opens the option booking link in a new tab (AC7)', async () => {
    open(data(), { 'PUT /trips/t1/sim': { status: 200, body: { ...trip, sim: { ...chosen, valid_to: '2027-03-31' } } } })
    fireEvent.click(await screen.findByRole('button', { name: 'Pick' }))
    expect(await screen.findByText(/Picked\. Your trip total and Book trip links now include this SIM\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove pick' })).toHaveAttribute('aria-pressed', 'true')
    const link = screen.getByRole('link', { name: /Booking link/ })
    expect(link).toHaveAttribute('href', 'https://roamly.example/europe-10')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('removes a pick', async () => {
    open(data({ picked: { ...chosen, valid_to: '2027-03-31', covers_dates: true } }), {
      'DELETE /trips/t1/sim': { status: 200, body: { ...trip, sim: null } },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove pick' }))
    expect(await screen.findByText('Pick removed from your trip.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick' })).toBeInTheDocument()
  })

  it('does not link a non-http booking URL', async () => {
    open(data({ options: [option({ url: 'javascript:alert(1)' })] }))
    await screen.findByText('Data: 10 GB')
    expect(screen.queryByRole('link', { name: /Booking link/ })).not.toBeInTheDocument()
  })

  it('warns and keeps the pick marked when the dates are no longer covered (AC14, 15)', async () => {
    open(data({ options: [], picked: { ...chosen, covers_dates: false } }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your picked SIM no longer covers the trip dates. Pick again.',
    )
    expect(screen.getByText('Picked')).toBeInTheDocument()
    expect(screen.getByText('Dates not covered')).toBeInTheDocument()
    expect(screen.getByText(/Valid 1 Mar 2027–10 Mar 2027 \(12 Mar 2027–20 Mar 2027 for this trip\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Booking link/ })).toBeInTheDocument()
  })

  it('says nothing matches and shows no list (AC16, 17)', async () => {
    open(data({ options: [] }))
    expect(await screen.findByText('No SIM options match this destination and trip dates.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    // the breadcrumb is the page's only list
    expect(within(screen.getByRole('main')).getAllByRole('list')).toHaveLength(1)
    expect(screen.queryByText('Group total')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change trip dates' })).toHaveAttribute('href', '/trips/t1')
  })

  it('shows the preference note and a failure alert', async () => {
    open(data({ preference: 'esim' }))
    expect(await screen.findByText('Preference: eSIM')).toBeInTheDocument()
    expect(screen.getByText('eSIM options are ranked first.')).toBeInTheDocument()
  })

  it('shows a failure message when loading fails', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip }, 'GET /trips/t1/sim-options': { status: 500 } })
    renderAt('/trips/t1/sim-options')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/We couldn't load SIM options/)).toBeInTheDocument()
  })
})
