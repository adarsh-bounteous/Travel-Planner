import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

  it.each([2, 3])('enables Compare with %i plans and every traveller aged', async (count) => {
    open(options(PLANS.slice(0, count)))
    expect(await screen.findByRole('link', { name: 'Compare' })).toHaveAttribute(
      'href',
      '/trips/t1/insurance-options/compare',
    )
  })

  it.each([0, 1])('disables Compare with %i plans and explains what to do', async (count) => {
    open(options(PLANS.slice(0, count)))
    const button = await screen.findByRole('button', { name: 'Compare' })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull()
    expect(button).toHaveAccessibleDescription(/at least 2 plans.*change your trip dates or travellers/i)
  })

  it('tells the user to add a missing traveller age and keeps Compare disabled', async () => {
    const travellers = [
      { label: 'You', age: 34 },
      { label: 'Maya Chen', age: null },
    ]
    open(options(PLANS, { travellers }))
    expect(
      await screen.findByText(/Add the missing traveller details to compare plans\. Maya Chen has no age yet\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add traveller details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull()
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

  it('asks for the details it can collect in a form instead of showing plans', async () => {
    open(options([], { missing: ['risky activities answer', 'age of Marco'], risky_activities: null }))
    expect(await screen.findByLabelText('Owner age')).toBeInTheDocument()
    expect(screen.queryByText(/We need a few more details/)).toBeNull()
    expect(screen.queryByText('No plans suit this trip.')).toBeNull()
  })

  it('asks for a missing destination and trip dates on the trip', async () => {
    open(options([], { missing: ['destination', 'trip dates', 'your age'] }))
    expect(await screen.findByText(/Add destination, trip dates to this trip/)).toBeInTheDocument()
  })

  const fillForm = async () => {
    fireEvent.change(await screen.findByLabelText('Owner age'), { target: { value: '34' } })
    fireEvent.change(screen.getByLabelText('Companion ages'), { target: { value: '61' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add companion' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Skiing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compare plans' }))
  }
  const openWithoutDetails = (put: { status: number; body: unknown } = { status: 200, body: trip }) => {
    const withTrip = { ...trip, destination: 'Japan', start_date: '2026-05-01', end_date: '2026-05-10', budget: 900 }
    const stub = stubApi({
      'GET /trips/t1': { status: 200, body: withTrip },
      'PUT /trips/t1': put,
      'POST /trips/t1/travellers': { status: 200, body: withTrip },
      'GET /trips/t1/insurance-options': {
        status: 200,
        body: options([], { missing: ['risky activities answer', 'your age'] }),
      },
    })
    // The first options call has no plans; once the details are saved, the next one does.
    const firstAnswer = stub.getMockImplementation()!
    let optionCalls = 0
    stub.mockImplementation(async (path, init) =>
      path === '/trips/t1/insurance-options' && optionCalls++ > 0
        ? new Response(JSON.stringify(options(PLANS)), { status: 200 })
        : firstAnswer(path, init),
    )
    renderAt('/trips/t1/insurance-options')
    return stub
  }

  it('saves the details and shows the comparison (AC4)', async () => {
    const stub = openWithoutDetails()
    await fillForm()
    expect(await screen.findByRole('link', { name: 'Compare' })).toHaveAttribute(
      'href',
      '/trips/t1/insurance-options/compare',
    )
    expect(calls(stub)).toEqual(
      expect.arrayContaining(['PUT /trips/t1', 'POST /trips/t1/travellers', 'GET /trips/t1/insurance-options']),
    )
    const put = stub.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT')
    expect(JSON.parse((put?.[1] as RequestInit).body as string)).toMatchObject({
      name: 'Japan',
      destination: 'Japan',
      owner_age: 34,
      risky_activities: true,
    })
    const post = stub.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST')
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ name: 'Companion 1', age: 61 })
  })

  it('never removes a traveller the form does not show', async () => {
    const withTrip = {
      ...trip,
      destination: 'Japan',
      start_date: '2026-05-01',
      end_date: '2026-05-10',
      travellers: [{ id: 'x1', name: 'Marco', citizenship: 'Italy' }],
    }
    const stub = stubApi({
      'GET /trips/t1': { status: 200, body: withTrip },
      'PUT /trips/t1': { status: 200, body: withTrip },
      'POST /trips/t1/travellers': { status: 200, body: withTrip },
      'GET /trips/t1/insurance-options': { status: 200, body: options([], { missing: ['your age'] }) },
    })
    renderAt('/trips/t1/insurance-options')
    await fillForm()
    await waitFor(() => expect(calls(stub)).toContain('POST /trips/t1/travellers'))
    expect(calls(stub).some((c) => c.startsWith('DELETE'))).toBe(false)
  })

  it('says when the details cannot be saved and shows no plans', async () => {
    openWithoutDetails({ status: 500, body: {} })
    await fillForm()
    expect(await screen.findByText("We couldn't save your details.")).toBeInTheDocument()
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('says when the options cannot be loaded', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip } })
    renderAt('/trips/t1/insurance-options')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load insurance options/i)
  })
})
