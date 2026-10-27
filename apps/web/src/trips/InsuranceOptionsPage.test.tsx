import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { InsuranceOptions, Trip } from './api'
import { PLANS, options, pick } from './insuranceFixtures'

afterEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

const trip: Trip = { id: 't1', name: 'Japan' }
const NOTE = 'This app only compares plans. It does not sell or advise on cover.'

const open = (body: InsuranceOptions, current: Trip = trip) => {
  const stub = stubApi({
    'GET /trips/t1': { status: 200, body: current },
    'GET /trips/t1/insurance-options': { status: 200, body },
    'PUT /trips/t1/insurance': { status: 200, body: { ...trip, insurance: pick() } },
    'DELETE /trips/t1/insurance': { status: 200, body: trip },
  })
  renderAt('/trips/t1/insurance-options')
  return stub
}
const calls = (stub: ReturnType<typeof stubApi>) =>
  stub.mock.calls.map(([path, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${path}`)
const card = (name: string) => screen.getByRole('article', { name })

describe('insurance options page', () => {
  it('lists the plans in shortlist order with a place badge and reason (AC1, AC2, AC19)', async () => {
    open(options(PLANS))
    await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(PLANS.map((p) => p.name))
    expect(within(card('Globetrek Adventure Plus')).getByText('Best fit')).toBeInTheDocument()
    expect(within(card('Asia Pacific Cover')).getByText('Place 2')).toBeInTheDocument()
    expect(within(card('Asia Pacific Cover')).getByText('Reason for Asia Pacific Cover.')).toBeInTheDocument()
    expect(screen.getByText(/Price, offers and provider commission never change the order/)).toBeInTheDocument()
    expect(within(card('Globetrek Adventure Plus')).getByText('Offer: 10% off online')).toBeInTheDocument()
  })

  it('shows each traveller price and the group total (AC14, AC15)', async () => {
    open(options(PLANS))
    const c = await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    expect(within(c).getByRole('row', { name: /Marco.*712/ })).toBeInTheDocument()
    expect(within(c).getByRole('row', { name: /You.*384/ })).toBeInTheDocument()
    expect(within(c).getByText('Group total').parentElement).toHaveTextContent('1,096 EUR')
  })

  it('offers Compare plans only with two or more plans (AC3)', async () => {
    open(options(PLANS.slice(0, 2)))
    expect(await screen.findByRole('link', { name: 'Compare plans' })).toHaveAttribute(
      'href',
      '/trips/t1/insurance-options/compare',
    )
  })

  it('has no Compare plans link with one plan (AC3)', async () => {
    open(options(PLANS.slice(0, 1)))
    await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    expect(screen.queryByRole('link', { name: 'Compare plans' })).toBeNull()
  })

  it('opens the provider link from a plan (AC4)', async () => {
    const win = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    open(options(PLANS))
    await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    fireEvent.click(within(card('Globetrek Adventure Plus')).getByRole('button', { name: 'Go to provider site' }))
    expect(win).toHaveBeenCalledWith('https://globetrek.example/plan', '_blank')
  })

  it('picks a plan, shows Picked and confirms with a toast (AC4)', async () => {
    const stub = open(options(PLANS))
    await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    fireEvent.click(within(card('Globetrek Adventure Plus')).getByRole('button', { name: 'Pick plan' }))
    expect(await within(card('Globetrek Adventure Plus')).findByText('Picked')).toBeVisible()
    const put = stub.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(JSON.parse((put?.[1] as RequestInit).body as string)).toEqual({ plan_id: 'globetrek' })
    expect(screen.getByText(/Picked\. Your trip total and Book trip links now include this plan\./)).toBeInTheDocument()
  })

  it('removes a pick', async () => {
    const stub = open(options(PLANS), { ...trip, insurance: pick() })
    const c = await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    expect(within(c).getByRole('button', { name: 'Remove pick' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(c).getByRole('button', { name: 'Remove pick' }))
    expect(await screen.findByText(/Pick removed\. Your trip total no longer includes insurance\./)).toBeInTheDocument()
    expect(calls(stub)).toContain('DELETE /trips/t1/insurance')
    expect(within(card('Globetrek Adventure Plus')).queryByText('Picked')).toBeNull()
  })

  it('shows the disclaimer and no purchase step (AC5, AC6)', async () => {
    open(options(PLANS))
    await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    expect(screen.getByRole('note')).toHaveTextContent(NOTE)
    expect(screen.queryByRole('button', { name: /buy|purchase|pay|checkout|book now/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /buy|purchase|pay|checkout/i })).toBeNull()
  })

  it('says so when the provider site cannot be opened and keeps the plan picked (AC10, AC11)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const stub = open(options(PLANS), { ...trip, insurance: pick() })
    const c = await screen.findByRole('article', { name: 'Globetrek Adventure Plus' })
    fireEvent.click(within(c).getByRole('button', { name: 'Go to provider site' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The provider's site could not be opened. Your plan is still picked.",
    )
    expect(calls(stub)).not.toContain('DELETE /trips/t1/insurance')
    expect(within(card('Globetrek Adventure Plus')).getByText('Picked')).toBeVisible()
  })

  it('says to try again when the failing plan is not picked (AC10)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    open(options(PLANS))
    const c = await screen.findByRole('article', { name: 'Asia Pacific Cover' })
    fireEvent.click(within(c).getByRole('button', { name: 'Go to provider site' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("The provider's site could not be opened. Try again.")
  })

  it('says no plans suit the trip and the need is not yet picked (AC17, AC18)', async () => {
    open(options([]))
    expect(await screen.findByText('No plans suit this trip.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Insurance: not yet picked')).toBeInTheDocument()
  })

  it('asks for missing details instead of showing plans', async () => {
    open(options([], { missing: ['risky activities answer', 'age of Marco'], risky_activities: null }))
    expect(await screen.findByText(/risky activities answer, age of Marco/)).toBeInTheDocument()
    expect(screen.queryByText('No plans suit this trip.')).toBeNull()
  })

  it('says when the options cannot be loaded', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip } })
    renderAt('/trips/t1/insurance-options')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load insurance options/i)
  })
})
