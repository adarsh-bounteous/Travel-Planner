import { fireEvent, screen, within } from '@testing-library/react'

import { renderAt, stubApi } from '../test-api'
import type { Trip } from './api'
import type { Conversion } from './convertApi'

afterEach(() => vi.unstubAllGlobals())

const trip: Trip = {
  id: 't1',
  name: 'Lisbon trip',
  budget: 100,
  currency: 'EUR',
  options: [
    { id: 'o1', title: 'Train to Lisbon', category: 'Conveyance', date: '2027-03-03', price: 100, currency: 'EUR' },
    { id: 'o2', title: 'Market tickets', category: 'Dining', date: '2027-03-03', price: 50, currency: 'XYZ' },
  ],
}

const RATES: Record<string, number> = { EUR: 1, USD: 1.08, GBP: 0.85, JPY: 160, AUD: 1.65 }

const convertReply = (amount: number, from: string, to: string): Conversion =>
  from in RATES && to in RATES
    ? {
        supported: true,
        amount: Number(((amount / RATES[from]) * RATES[to]).toFixed(2)),
        currency: to,
        rate: RATES[to] / RATES[from],
      }
    : { supported: false, message: 'XYZ is not supported. Supported currencies: EUR, USD, GBP, JPY, AUD.' }

const convertKey = (amount: number, from: string, to: string) =>
  `GET /rates/convert?${new URLSearchParams({ amount: String(amount), from, to })}`

function show(url = '/trips/t1/costs') {
  const replies: Record<string, { status: number; body?: unknown }> = {
    'GET /trips/t1': { status: 200, body: trip },
  }
  for (const to of Object.keys(RATES)) {
    replies[convertKey(100, 'EUR', to)] = { status: 200, body: convertReply(100, 'EUR', to) }
    replies[convertKey(50, 'XYZ', to)] = { status: 200, body: convertReply(50, 'XYZ', to) }
  }
  stubApi(replies)
  renderAt(url)
}

describe('CostsPage', () => {
  it('shows the original and the converted amount with its code (AC1, AC2)', async () => {
    show()
    expect(await screen.findByText('108.00 USD')).toBeInTheDocument()
    expect(screen.getByText('100.00 EUR')).toBeInTheDocument()
  })

  it('lists every offered currency in Show in, AUD included (AC6)', async () => {
    show()
    const select = await screen.findByLabelText('Show in')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['USD', 'EUR', 'GBP', 'JPY', 'AUD'])
  })

  it('converts again when another currency is chosen (AC6)', async () => {
    show()
    fireEvent.change(await screen.findByLabelText('Show in'), { target: { value: 'AUD' } })
    expect(await screen.findByText('165.00 AUD')).toBeInTheDocument()
  })

  it('says the currency is not supported and shows no converted amount (AC7, AC8)', async () => {
    show()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Currency not supported')
    const row = alert.closest('.cost-row') as HTMLElement
    expect(within(row).getByText('50 XYZ')).toBeInTheDocument()
    expect(within(row).queryByText(/USD$/)).not.toBeInTheDocument()
  })

  it('shows the budget converted at the local rate (AC3)', async () => {
    show('/trips/t1/costs?tab=budget')
    expect(await screen.findByText('Budget 100.00 EUR')).toBeInTheDocument()
    expect(await within(screen.getByRole('group', { name: 'Budget in USD' })).findByText('108.00 USD')).toBeInTheDocument()
  })

  it('says local mode uses the local rate table', async () => {
    show()
    expect(await screen.findByText(/not the outside rates service/)).toBeInTheDocument()
  })
})
