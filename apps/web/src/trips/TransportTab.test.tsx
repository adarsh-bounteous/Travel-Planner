import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Trip, TransportPick } from './api'
import { TransportTab } from './TransportTab'

afterEach(() => vi.unstubAllGlobals())

const pick = (leg: TransportPick['leg'], extra: Partial<TransportPick> = {}): TransportPick => ({
  leg,
  option_id: `${leg}-1`,
  mode: 'flight',
  provider: 'Atlantic Air',
  origin: 'Home',
  destination: 'Lisbon',
  date: '2027-01-01',
  estimate: false,
  fare: '180',
  picked_fare: '180',
  currency: 'EUR',
  url: 'https://airline.example/a',
  ...extra,
})
const taxi = pick('local_taxi', {
  mode: 'taxi',
  provider: 'Taxi Lisboa',
  estimate: true,
  fare: '25',
  picked_fare: '25',
  url: 'https://taxi.example/t',
})
const cost = (total: number) => ({
  currency: 'EUR',
  total,
  budget: null,
  over_budget_by: 0,
  missing_categories: [],
  unpriced_count: 0,
  unconvertible_count: 0,
  rates: [],
})
const trip = (transport: TransportPick[], total: number): Trip => ({
  id: 't1',
  name: 'Lisbon trip',
  destination: 'Lisbon',
  start_date: '2027-01-01',
  can_edit: true,
  currency: 'EUR',
  transport,
  cost: cost(total),
})

function open(loaded: Trip, replies: Record<string, Trip> = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`
    const body = replies[key] ?? loaded
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const onChanged = vi.fn()
  render(
    <MemoryRouter>
      <TransportTab trip={loaded} onChanged={onChanged} onViewItinerary={() => {}} />
    </MemoryRouter>,
  )
  return { fetchMock, onChanged }
}

describe('transport tab', () => {
  it('shows the booking link beside the note, and no payment control (AC5, AC10, AC12)', () => {
    open(trip([pick('destination')], 180))
    const link = screen.getByRole('link', { name: /Book with provider/ })
    expect(link).toHaveAttribute('href', 'https://airline.example/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText("Fare may differ on the provider's booking page.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay|checkout|buy/i })).toBeNull()
  })

  it('shows all three picks (AC11) and a total with the taxi estimate (AC6, AC7)', () => {
    open(trip([pick('destination'), pick('between_cities', { mode: 'bus' }), taxi], 385))
    expect(screen.getAllByRole('link', { name: /Book with provider/ })).toHaveLength(3)
    expect(screen.getByText(/Estimate .*25\.00/)).toBeInTheDocument()
    expect(screen.getByText(/385 EUR/)).toBeInTheDocument()
    expect(screen.getByText(/Adds up 3 picks, including taxi estimates/)).toBeInTheDocument()
  })

  it('clearing removes the pick and updates the total (AC3, AC8)', async () => {
    const before = trip([pick('destination'), taxi], 205)
    open(before, { 'DELETE /trips/t1/transport/destination': trip([taxi], 25) })
    const leg = screen.getByRole('heading', { name: 'To and from Lisbon' }).closest('.card')! as HTMLElement
    fireEvent.click(within(leg).getByRole('button', { name: 'Clear' }))
    expect(await within(leg).findByText('No transport picked yet')).toBeInTheDocument()
    expect(screen.getByText(/25 EUR/)).toBeInTheDocument()
    expect(screen.getByText(/Cleared Atlantic Air\. It is no longer in your trip total\./)).toBeInTheDocument()
  })

  it('refreshes on mount and shows a changed fare while the pick stays (AC13)', async () => {
    const changed = trip([pick('destination', { fare: '195' })], 195)
    open(trip([pick('destination')], 180), { 'POST /trips/t1/transport/refresh': changed })
    expect(await screen.findByText(/Fare updated, was .*180\.00/)).toBeInTheDocument()
    expect(screen.getByText(/A fare changed after you picked it/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Book with provider/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/195 EUR/, { selector: '.badge' })).toBeInTheDocument())
  })

  it('offers a shortlist for an empty leg', () => {
    open(trip([], 0))
    expect(screen.getAllByText('No transport picked yet')).toHaveLength(3)
    const choose = screen.getAllByRole('link', { name: 'Choose transport' })
    expect(choose[2].getAttribute('href')).toContain('leg=local_taxi')
  })
})
