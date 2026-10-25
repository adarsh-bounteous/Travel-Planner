import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Reply } from '../test-api'
import type { Stay, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const lisbon: Stay = { id: 's1', place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05' }
const porto: Stay = { id: 's2', place: 'Porto', start_date: '2027-01-10', end_date: '2027-01-12' }

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Iberia',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [],
  options: [],
  reminders: [],
  activities: [],
  stays: [],
  ...overrides,
})

const open = async (t: Trip, extra: Record<string, Reply> = {}) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: t },
    'GET /trips': { status: 200, body: [] },
    ...extra,
  })
  renderAt('/trips/t1')
  fireEvent.click(await screen.findByRole('tab', { name: 'Stays' }))
  return fetchMock
}

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)

const fill = (place: string, start: string, end: string) => {
  fireEvent.change(screen.getByLabelText('Place'), { target: { value: place } })
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: end } })
}

const addAndFill = async (...args: [string, string, string]) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add stay' }))
  fill(...args)
  fireEvent.click(screen.getByRole('button', { name: 'Save stay' }))
}

describe('stays tab', () => {
  it('shows the empty state with one Add stay (AC1)', async () => {
    await open(trip())
    expect(await screen.findByText('No stays yet. Add a place and dates for this trip.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add stay' })).toHaveLength(1)
  })

  it('adds a first stay and toasts (AC1)', async () => {
    const fetchMock = await open(trip(), {
      'POST /trips/t1/stays': { status: 201, body: trip({ stays: [lisbon] }) },
    })
    await addAndFill('Lisbon', '2027-01-01', '2027-01-05')
    expect(await screen.findByText('1 to 5 January')).toBeInTheDocument()
    expect(screen.getByText('(4 nights)')).toBeInTheDocument()
    expect(screen.getByText('Stay saved. 1 stay in this trip.')).toBeInTheDocument()
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string)).toEqual({
      place: 'Lisbon',
      start_date: '2027-01-01',
      end_date: '2027-01-05',
    })
  })

  it('lists two stays in start-date order (AC2)', async () => {
    await open(trip({ stays: [porto, lisbon] }))
    const places = await screen.findAllByText(/^(Lisbon|Porto)$/)
    expect(places.map((p) => p.textContent)).toEqual(['Lisbon', 'Porto'])
  })

  it('changes a stay from the prefilled drawer (AC3)', async () => {
    await open(trip({ stays: [lisbon] }), {
      'PUT /trips/t1/stays/s1': {
        status: 200,
        body: trip({ stays: [{ ...lisbon, place: 'Faro', start_date: '2027-01-02', end_date: '2027-01-06' }] }),
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit stay' }))
    expect(screen.getByRole('dialog', { name: 'Edit stay' })).toBeInTheDocument()
    expect(screen.getByLabelText('Place')).toHaveValue('Lisbon')
    fill('Faro', '2027-01-02', '2027-01-06')
    fireEvent.click(screen.getByRole('button', { name: 'Save stay' }))
    expect(await screen.findByText('Faro')).toBeInTheDocument()
    expect(screen.getByText('2 to 6 January')).toBeInTheDocument()
    expect(screen.getByText('Stay updated. 1 stay in this trip.')).toBeInTheDocument()
  })

  it('removes a stay only after confirming (AC4)', async () => {
    const fetchMock = await open(trip({ stays: [lisbon] }), {
      'DELETE /trips/t1/stays/s1': { status: 200, body: trip() },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('alertdialog', { name: 'Remove this stay?' })).toBeInTheDocument()
    expect(screen.getByText('Lisbon, 1 to 5 January')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(sent(fetchMock, 'DELETE')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No stays yet. Add a place and dates for this trip.')).toBeInTheDocument()
    expect(sent(fetchMock, 'DELETE')).toHaveLength(1)
    expect(screen.getByText('Removed Lisbon, 1 to 5 January.')).toBeInTheDocument()
  })

  it('hides the controls from a viewer', async () => {
    await open(trip({ stays: [lisbon], can_edit: false, is_owner: false }))
    expect(await screen.findByText('Lisbon')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add stay' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit stay' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })
})

describe('warnings (AC6 to AC9)', () => {
  const post = (stays: Stay[]): Record<string, Reply> => ({
    'POST /trips/t1/stays': { status: 201, body: trip({ stays }) },
  })

  it('warns about an overlap, and saves on Save anyway', async () => {
    const added = { id: 's3', place: 'Porto', start_date: '2027-01-04', end_date: '2027-01-08' }
    const fetchMock = await open(trip({ stays: [lisbon] }), post([lisbon, added]))
    await addAndFill('Porto', '2027-01-04', '2027-01-08')
    expect(await screen.findByRole('alertdialog', { name: 'These dates overlap another stay' })).toBeInTheDocument()
    expect(screen.getByText('1 to 5 January in Lisbon overlaps 4 to 8 January in Porto.')).toBeInTheDocument()
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(sent(fetchMock, 'POST')).toHaveLength(1))
    expect(await screen.findByText('Porto')).toBeInTheDocument()
    expect(screen.getByText('Overlaps Porto')).toBeInTheDocument()
  })

  it('Change dates returns to the drawer with values kept', async () => {
    const fetchMock = await open(trip({ stays: [lisbon] }))
    await addAndFill('Porto', '2027-01-04', '2027-01-08')
    fireEvent.click(await screen.findByRole('button', { name: 'Change dates' }))
    expect(screen.getByLabelText('Place')).toHaveValue('Porto')
    expect(screen.getByLabelText('Start date')).toHaveValue('2027-01-04')
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
  })

  it('warns about a gap, and saves on Save anyway', async () => {
    const fetchMock = await open(trip({ stays: [lisbon] }), post([lisbon, porto]))
    await addAndFill('Porto', '2027-01-10', '2027-01-12')
    expect(await screen.findByRole('alertdialog', { name: 'There is a gap between stays' })).toBeInTheDocument()
    expect(screen.getByText('No stay covers 6 to 9 January between Lisbon and Porto.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(sent(fetchMock, 'POST')).toHaveLength(1))
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string)).toEqual({
      place: 'Porto',
      start_date: '2027-01-10',
      end_date: '2027-01-12',
    })
  })
})

describe('refusals (AC10 to AC13)', () => {
  it('names each missing field and sends nothing', async () => {
    const fetchMock = await open(trip())
    fireEvent.click(await screen.findByRole('button', { name: 'Add stay' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save stay' }))
    expect(await screen.findByText('Place is missing. Enter a place for this stay.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Place' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('Start date and end date are missing. Choose when the stay starts and ends.')).toHaveLength(2)
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
  })

  it('names a missing end date', async () => {
    await open(trip())
    await addAndFill('Lisbon', '2027-01-01', '')
    expect(await screen.findByText('End date is missing. Choose when the stay ends.')).toBeInTheDocument()
  })

  it('names a missing start date', async () => {
    await open(trip())
    await addAndFill('Lisbon', '', '2027-01-05')
    expect(await screen.findByText('Start date is missing. Choose when the stay starts.')).toBeInTheDocument()
  })

  it('refuses reversed dates until they are fixed', async () => {
    const fetchMock = await open(trip())
    await addAndFill('Lisbon', '2027-01-08', '2027-01-04')
    expect((await screen.findAllByText('The dates are invalid. The end date is before the start date.')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save stay' })).toBeDisabled()
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-01-09' } })
    expect(screen.getByRole('button', { name: 'Save stay' })).toBeEnabled()
  })
})
