import { fireEvent, screen } from '@testing-library/react'
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
const base = {
  destination_currency: 'JPY',
  home_currency: 'EUR',
  start_date: '2026-11-03',
  end_date: '2026-11-09',
}
const live = { ...base, live: { rate: '0.0061', inverse: '163.93', as_of: '2026-10-27' }, last_known: null }

const open = (helper: unknown) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/currency-helper': { status: 200, body: helper },
  })
  renderAt('/trips/t1/currency')
}

describe('Currency helper', () => {
  it('shows the destination currency, the live rate and the dates', async () => {
    open(live)
    expect(await screen.findByText('JPY (japanese yen)')).toBeInTheDocument()
    expect(screen.getByText('Live rate: JPY 1 = EUR 0.0061')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(formatTripDates('2026-11-03', '2026-11-09')))).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/1,000 JPY/)
  })

  it('converts from the destination currency to the home currency', async () => {
    open(live)
    fireEvent.change(await screen.findByLabelText('Amount in JPY'), { target: { value: '1,000' } })
    expect(await screen.findByText('JPY 1,000 = EUR 6.10')).toBeInTheDocument()
  })

  it('converts from the home currency to the destination currency', async () => {
    open(live)
    fireEvent.change(await screen.findByLabelText('Amount in EUR'), { target: { value: '6.10' } })
    expect(screen.getByLabelText('Amount in JPY')).toHaveValue('1,000')
  })

  it('says the live rate is unavailable when there is no last known rate', async () => {
    open({ ...base, live: null, last_known: null })
    expect(await screen.findByRole('alert')).toHaveTextContent('The live rate is unavailable right now.')
    expect(screen.queryByLabelText('Amount in JPY')).not.toBeInTheDocument()
  })

  it('shows the last known rate with its date', async () => {
    open({ ...base, live: null, last_known: { rate: '0.0061', as_of: '2026-10-14' } })
    const date = formatDate('2026-10-14')
    expect(await screen.findByText(`Last known rate: JPY 1 = EUR 0.0061, dated ${date}`)).toBeInTheDocument()
    expect(screen.getByText('JPY 1,000 = EUR 6.10 at the last known rate')).toBeInTheDocument()
  })
})
