import { render, screen } from '@testing-library/react'
import type { CostSummary } from './api'
import { TripTotalCard } from './TripTotalCard'

const cost = (overrides: Partial<CostSummary> = {}): CostSummary => ({
  currency: 'EUR',
  total: 200,
  budget: 250,
  over_budget_by: 0,
  missing_categories: [],
  unpriced_count: 0,
  unconvertible_count: 0,
  rates: [],
  ...overrides,
})

const show = (overrides: Partial<CostSummary> = {}) =>
  render(<TripTotalCard cost={cost(overrides)} />)

describe('TripTotalCard', () => {
  it('shows the total with its currency code (AC7)', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: '200 EUR' })).toBeInTheDocument()
    expect(screen.getByText('Budget 250 EUR')).toBeInTheDocument()
  })

  it('warns with the exact amount over budget (AC2)', () => {
    show({ budget: 150, over_budget_by: 50 })
    expect(screen.getByRole('alert')).toHaveTextContent('Over budget by 50 EUR')
  })

  it('does not warn under or at budget (AC3, AC4)', () => {
    show({ budget: 200 })
    expect(screen.queryByText(/Over budget/)).not.toBeInTheDocument()
  })

  it('says no budget is set and never warns', () => {
    show({ budget: null })
    expect(screen.getByText('No budget set')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('names the needed categories that still need a pick (AC5)', () => {
    show({ missing_categories: ['Conveyance', 'Dining'] })
    expect(
      screen.getByText('Plan incomplete: conveyance and dining still need a pick'),
    ).toBeInTheDocument()
  })

  it('has no incomplete note when nothing is missing (AC6)', () => {
    show()
    expect(screen.queryByText(/Plan incomplete/)).not.toBeInTheDocument()
  })

  it('notes chosen options without a price (AC9)', () => {
    show({ unpriced_count: 1 })
    expect(
      screen.getByText('One chosen option has no price and is not in the total.'),
    ).toBeInTheDocument()
  })

  it('pluralises the no-price note and is absent at zero', () => {
    const { unmount } = show({ unpriced_count: 2 })
    expect(
      screen.getByText('2 chosen options have no price and are not in the total.'),
    ).toBeInTheDocument()
    unmount()
    show()
    expect(screen.queryByText(/no price/)).not.toBeInTheDocument()
  })

  it('shows the exchange rate used beside the total (AC11)', () => {
    show({ rates: [{ currency: 'USD', rate: 0.92 }] })
    expect(screen.getByText('USD converted at 1 USD = 0.92 EUR')).toBeInTheDocument()
  })

  it('says no conversion was needed when everything is in the trip currency', () => {
    show()
    expect(
      screen.getByText('All chosen options are priced in EUR, so no conversion was needed.'),
    ).toBeInTheDocument()
  })
})
