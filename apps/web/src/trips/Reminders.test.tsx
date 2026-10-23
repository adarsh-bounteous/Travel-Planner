import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Reply } from '../test-api'
import type { Reminder, Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const note = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  text: 'Pack passports',
  date: '2027-03-04',
  option_id: null,
  option_date: null,
  ...overrides,
})

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  start_date: '2027-03-03',
  end_date: '2027-03-05',
  budget: 1500,
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
    { date: '2027-03-05', name: 'Day 3' },
  ],
  options: [
    { id: 'o1', title: 'Tram pass', category: 'Conveyance', date: '2027-03-03' },
    { id: 'o2', title: 'Belém Tower tickets', category: 'Attractions', date: '2027-03-04' },
  ],
  reminders: [],
  ...overrides,
})

const open = (t: Trip, extra: Record<string, Reply> = {}) => {
  const fetchMock = stubApi({
    'GET /trips/t1': { status: 200, body: t },
    'GET /trips': { status: 200, body: [] },
    ...extra,
  })
  renderAt('/trips/t1')
  return fetchMock
}

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method)

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('reminders', () => {
  it('adds a trip reminder and shows it on its day (AC1)', async () => {
    const fetchMock = open(trip(), {
      'POST /trips/t1/reminders': { status: 201, body: trip({ reminders: [note()] }) },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Add reminder' }))
    type('Reminder', 'Pack passports')
    type('Date', '2027-03-04')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const day4 = within(await screen.findByRole('region', { name: /4 March/ }))
    expect(await day4.findByText('Pack passports')).toBeInTheDocument()
    expect(day4.getByText('4 March', { selector: '.badge' })).toBeInTheDocument()
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string)).toEqual({
      text: 'Pack passports',
      date: '2027-03-04',
      option_id: null,
    })
    expect(screen.getByText('Reminder saved for 4 March.')).toBeInTheDocument()
  })

  it('shows errors after submit and keeps what was typed (AC1)', async () => {
    const fetchMock = open(trip())
    fireEvent.click(await screen.findByRole('button', { name: 'Add reminder' }))
    type('Date', '2027-04-01')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Write what to remember, then save.')).toBeInTheDocument()
    expect(
      screen.getByText("That date isn't on this trip. Pick a day from 3 to 5 March."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2027-04-01')
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
  })

  it('preselects the activity and shows the note under it (AC2)', async () => {
    const saved = trip({ reminders: [note({ option_id: 'o2', option_date: '2027-03-04' })] })
    const fetchMock = open(trip(), { 'POST /trips/t1/reminders': { status: 201, body: saved } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add reminder to Belém Tower tickets' }))
    expect(screen.getByLabelText('Attach to')).toHaveValue('o2')
    type('Reminder', 'Pack passports')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const day4 = within(await screen.findByRole('region', { name: /4 March/ }))
    const option = (await day4.findByText('Pack passports')).closest('.option')
    expect(option).toHaveTextContent('Belém Tower tickets')
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string).option_id).toBe('o2')
  })

  it('moves an edited reminder to its new day (AC3)', async () => {
    const moved = trip({ reminders: [note({ date: '2027-03-05' })] })
    open(trip({ reminders: [note()] }), { 'PUT /trips/t1/reminders/r1': { status: 200, body: moved } })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit reminder: Pack passports' }))
    type('Date', '2027-03-05')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: /5 March/ })).getByText('Pack passports'),
      ).toBeInTheDocument(),
    )
    expect(
      within(screen.getByRole('region', { name: /4 March/ })).queryByText('Pack passports'),
    ).not.toBeInTheDocument()
  })

  it('deletes at once with an Undo that adds it back (AC4)', async () => {
    const fetchMock = open(trip({ reminders: [note()] }), {
      'DELETE /trips/t1/reminders/r1': { status: 200, body: trip() },
      'POST /trips/t1/reminders': { status: 201, body: trip({ reminders: [note()] }) },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit reminder: Pack passports' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Pack passports')).not.toBeInTheDocument())
    expect(screen.getByText('Reminder deleted.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Pack passports')).toBeInTheDocument()
    expect(sent(fetchMock, 'POST')).toHaveLength(1)
  })

  it('shows a viewer no add control (AC5)', async () => {
    open(trip({ can_edit: false, is_owner: false }))
    await screen.findByRole('tab', { name: 'Itinerary' })
    expect(screen.queryByRole('button', { name: /Add reminder/ })).not.toBeInTheDocument()
  })

  it('shows a viewer the note but no edit or delete control (AC6)', async () => {
    open(trip({ can_edit: false, is_owner: false, reminders: [note()] }))
    expect(await screen.findByText('Pack passports')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit reminder/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })

  it('says reminders stay in the app (AC7)', async () => {
    open(trip())
    expect(await screen.findByText(/We don't send email or push messages\./)).toBeInTheDocument()
  })
})
