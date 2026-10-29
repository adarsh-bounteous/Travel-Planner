import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import { PLANS, options } from './insuranceFixtures'

afterEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

const open = (plans = PLANS) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: { id: 't1', name: 'Japan' } },
    'GET /trips/t1/insurance-options': { status: 200, body: options(plans) },
  })
  renderAt('/trips/t1/insurance-options/compare')
}

describe('insurance compare page', () => {
  it('shows every shortlisted plan together, in shortlist order (AC3)', async () => {
    open()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(1 + PLANS.length)
    PLANS.forEach((p, i) => expect(rows[i + 1]).toHaveTextContent(p.name))
  })

  it('shows reason, each traveller price and the group total (AC14, AC15, AC19)', async () => {
    open()
    const table = await screen.findByRole('table')
    const row = within(table).getAllByRole('row')[1]
    expect(row).toHaveTextContent('Reason for Globetrek Adventure Plus.')
    expect(row).toHaveTextContent('Marco: 712 EUR')
    expect(row).toHaveTextContent('1,096 EUR')
  })

  it('shows the disclaimer and no purchase step (AC5, AC6)', async () => {
    open()
    await screen.findByRole('table')
    expect(screen.getByRole('note')).toHaveTextContent(
      'This app only compares plans. It does not sell or advise on cover.',
    )
    expect(screen.queryByRole('button', { name: /buy|purchase|pay|checkout|book now/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /buy|purchase|pay|checkout/i })).toBeNull()
  })

  it('opens a plan provider site (AC4)', async () => {
    const win = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    open()
    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getAllByRole('link', { name: 'Go to provider site' })[1])
    expect(win).toHaveBeenCalledWith('https://asia-pacific.example/plan', '_blank')
  })

  it('goes back to the shortlist when fewer than two plans exist', async () => {
    open(PLANS.slice(0, 1))
    expect(await screen.findByRole('heading', { name: 'Insurance options' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Shortlisted insurance plans side by side' })).toBeNull()
  })

  it('shows the plans in the shared compare table (AC2)', async () => {
    open()
    expect(await screen.findByRole('table')).toHaveClass('compare-table')
  })
})
