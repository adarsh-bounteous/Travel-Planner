import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const created = {
  id: 'new-id',
  name: 'Lisbon long weekend',
  destination: 'Lisbon',
  start_date: '2027-03-12',
  end_date: '2027-03-15',
  budget: 1800,
  currency: 'EUR',
  traveller_count: 2,
}
const replies = {
  'POST /trips': { status: 201, body: created },
  'GET /trips/new-id': { status: 200, body: created },
  'GET /trips': { status: 200, body: [] },
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillAll() {
  type('Destination', 'Lisbon')
  type('Start date', '2027-03-12')
  type('End date', '2027-03-15')
  type('Number of travellers', '2')
  type('Budget', '1800')
  type('Trip currency', 'EUR')
  type('Trip name', 'Lisbon long weekend')
}

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

describe('New trip set-up', () => {
  it('creates the trip with the entered values and shows the shortlists (AC1, AC7)', async () => {
    const fetchMock = stubApi(replies)
    renderAt('/trips/new')
    await screen.findByLabelText('Destination')
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByRole('heading', { name: 'Shortlists' })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([p, init]) => p === '/trips' && init?.method === 'POST')
    expect(JSON.parse(post![1]!.body as string)).toEqual({
      name: 'Lisbon long weekend',
      destination: 'Lisbon',
      start_date: '2027-03-12',
      end_date: '2027-03-15',
      traveller_count: 2,
      budget: 1800,
      currency: 'EUR',
    })
    expect(screen.getByText(/Lisbon long weekend is ready/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Places' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Trip created. Here are your shortlists.')).toBeInTheDocument()
  })

  it('opens with no trip currency chosen (AC8)', async () => {
    stubApi(replies)
    renderAt('/trips/new')
    expect(await screen.findByLabelText('Trip currency')).toHaveValue('')
    expect(screen.queryByText(/Everything in this trip is shown in/)).not.toBeInTheDocument()
  })

  it('shows the chosen currency as the trip currency (AC2)', async () => {
    stubApi(replies)
    renderAt('/trips/new')
    await screen.findByLabelText('Trip currency')
    type('Trip currency', 'GBP')
    expect(
      screen.getByText(/Trip currency: GBP\. Everything in this trip is shown in pounds sterling\./),
    ).toBeInTheDocument()
  })

  it.each([
    ['Destination', 'Enter a destination, like Lisbon.'],
    ['Start date', 'Enter a start and end date.'],
    ['Number of travellers', 'Enter the number of travellers.'],
    ['Budget', 'Enter a budget.'],
    ['Trip name', 'Enter a trip name.'],
    ['Trip currency', 'Choose a trip currency.'],
  ])('blocks Finish when %s is missing and says so beside it (AC9)', async (label, message) => {
    const fetchMock = stubApi(replies)
    renderAt('/trips/new')
    await screen.findByLabelText('Destination')
    fillAll()
    type(label, '')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const field = screen.getByLabelText(label)
    const error = await screen.findByText(message)
    expect(error.closest('.field, .stack')).toContainElement(field)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText("Finish isn't ready yet.")).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(0)
  })

  it('blocks Finish on an invalid value beside the field (AC10)', async () => {
    const fetchMock = stubApi(replies)
    renderAt('/trips/new')
    await screen.findByLabelText('Destination')
    fillAll()
    type('Number of travellers', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const error = await screen.findByText('Enter at least one traveller, as a whole number.')
    expect(error.closest('.field')).toContainElement(screen.getByLabelText('Number of travellers'))
    expect(posts(fetchMock)).toHaveLength(0)
  })

  it('keeps the values and says so when saving fails', async () => {
    stubApi({ ...replies, 'POST /trips': { status: 500 } })
    renderAt('/trips/new')
    await screen.findByLabelText('Destination')
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText("We couldn't save this trip. Try again.")).toBeInTheDocument()
    expect(screen.getByLabelText('Destination')).toHaveValue('Lisbon')
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled()
  })

  it('saves nothing when the traveller leaves without finishing (AC6)', async () => {
    const fetchMock = stubApi({ 'GET /trips': { status: 200, body: [] } })
    renderAt('/trips/new')
    await screen.findByLabelText('Destination')
    type('Destination', 'Lisbon')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave set-up?' })
    expect(within(dialog).getByText('Your trip is not saved until you finish set-up.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }))
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(0)
    expect(screen.queryByRole('heading', { level: 2, name: 'Lisbon' })).not.toBeInTheDocument()
  })

  it('keeps the typed values on Keep editing', async () => {
    stubApi(replies)
    renderAt('/trips/new')
    await screen.findByLabelText('Destination')
    type('Destination', 'Lisbon')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Leave set-up?' })).getByRole('button', {
        name: 'Keep editing',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Destination')).toHaveValue('Lisbon')
  })
})
