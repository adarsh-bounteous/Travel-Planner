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
const BLANK = {
  display_name: '',
  home_city: '',
  dietary_notes: '',
  citizenship: '',
  residence: '',
  health_status: '',
  religion: '',
  diet: '',
  tastes: [],
  travel_style: '',
}
const FULL = {
  ...BLANK,
  display_name: 'Maya',
  citizenship: 'Ireland',
  residence: 'Portugal',
  health_status: 'Allergies',
  religion: 'Hindu',
  diet: 'Vegan',
  tastes: ['Food'],
  travel_style: 'Relaxed',
}
const replies = {
  'GET /profile': { status: 200, body: FULL },
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

/** With a complete saved profile, set-up opens on the profile note; Continue reaches the details. */
async function toDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  return screen.findByLabelText('Destination')
}

const puts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([p, init]) => p === '/profile' && init?.method === 'PUT')

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

describe('New trip set-up', () => {
  it('creates the trip with the entered values and shows the shortlists (AC1, AC7)', async () => {
    const fetchMock = stubApi(replies)
    renderAt('/trips/new')
    await toDetails()
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
    await toDetails()
    expect(screen.getByLabelText('Trip currency')).toHaveValue('')
    expect(screen.queryByText(/Everything in this trip is shown in/)).not.toBeInTheDocument()
  })

  it('shows the chosen currency as the trip currency (AC2)', async () => {
    stubApi(replies)
    renderAt('/trips/new')
    await toDetails()
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
    await toDetails()
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
    await toDetails()
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
    await toDetails()
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText("We couldn't save this trip. Try again.")).toBeInTheDocument()
    expect(screen.getByLabelText('Destination')).toHaveValue('Lisbon')
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled()
  })

  it('saves nothing when the traveller leaves without finishing (AC6)', async () => {
    const fetchMock = stubApi({ ...replies, 'POST /trips': { status: 500 } })
    renderAt('/trips/new')
    await toDetails()
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
    await toDetails()
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

describe('New trip set-up profile step', () => {
  const withProfile = (profile: object, extra = {}) =>
    stubApi({ ...replies, 'GET /profile': { status: 200, body: profile }, ...extra })
  const cont = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  it('asks every unanswered question (AC1, AC2, AC3)', async () => {
    withProfile(BLANK)
    renderAt('/trips/new')
    expect(await screen.findByLabelText('Citizenship')).toBeInTheDocument()
    expect(screen.getByLabelText('Residence')).toBeInTheDocument()
    for (const l of ['Health status', 'Religion', 'Diet', 'Travel style'])
      expect(screen.getByLabelText(l)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tastes' })).toBeInTheDocument()
  })

  it('blocks Continue with errors when both required answers are missing (AC4, AC5)', async () => {
    withProfile(BLANK)
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    cont()
    expect(screen.getByText("Continue isn't ready yet.")).toBeInTheDocument()
    expect(screen.getAllByText('Choose your citizenship to continue')).not.toHaveLength(0)
    expect(screen.getAllByText('Choose your country of residence to continue')).not.toHaveLength(0)
    expect(screen.getByLabelText('Citizenship')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Residence')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument()
  })

  it('names only the missing required answer', async () => {
    withProfile(BLANK)
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Residence', 'Portugal')
    cont()
    expect(screen.getAllByText('Choose your citizenship to continue')).not.toHaveLength(0)
    expect(screen.queryByText('Choose your country of residence to continue')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument()
  })

  it('continues with only the required answers, skipping the optional ones (AC6, AC7)', async () => {
    withProfile(BLANK)
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Citizenship', 'Ireland')
    type('Residence', 'Portugal')
    cont()
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()
    expect(screen.queryByText(/Continue isn't ready yet/)).not.toBeInTheDocument()
  })

  it('does not show a saved answer, only the rest (AC9, AC11)', async () => {
    withProfile({ ...BLANK, citizenship: 'Ireland', religion: 'Hindu' })
    renderAt('/trips/new')
    expect(await screen.findByLabelText('Residence')).toBeInTheDocument()
    expect(screen.queryByLabelText('Citizenship')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Religion')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Diet')).toBeInTheDocument()
  })

  it('shows no question when everything is saved, and Continue still works (AC10)', async () => {
    withProfile(FULL)
    renderAt('/trips/new')
    expect(await screen.findByText('Your profile is already saved.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    cont()
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()
  })

  it('saves new answers merged with the saved profile at Finish (AC8)', async () => {
    const fetchMock = withProfile(
      { ...BLANK, display_name: 'Maya' },
      { 'PUT /profile': { status: 200, body: FULL } },
    )
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Citizenship', 'Ireland')
    type('Residence', 'Portugal')
    type('Diet', 'Vegetarian')
    expect(puts(fetchMock)).toHaveLength(0)
    cont()
    await screen.findByLabelText('Destination')
    expect(puts(fetchMock)).toHaveLength(0)
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(
      await screen.findByText('Trip created. 3 profile answers saved for next time.'),
    ).toBeInTheDocument()
    expect(JSON.parse(puts(fetchMock)[0][1]!.body as string)).toMatchObject({
      citizenship: 'Ireland',
      residence: 'Portugal',
      diet: 'Vegetarian',
      display_name: 'Maya',
      religion: '',
    })
  })

  it('keeps the answers when going back from the details (AC8)', async () => {
    withProfile(BLANK)
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Citizenship', 'Ireland')
    type('Residence', 'Portugal')
    cont()
    await screen.findByLabelText('Destination')
    fireEvent.click(screen.getByRole('button', { name: 'Back to profile' }))
    expect(await screen.findByLabelText('Citizenship')).toHaveValue('Ireland')
  })

  it('saves nothing for skipped questions and asks them again next time (AC12)', async () => {
    const fetchMock = withProfile({ ...BLANK, citizenship: 'Ireland', residence: 'Portugal' })
    renderAt('/trips/new')
    await screen.findByLabelText('Travel style')
    cont()
    await screen.findByLabelText('Destination')
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('Trip created. Here are your shortlists.')).toBeInTheDocument()
    expect(puts(fetchMock)).toHaveLength(0)
  })

  it('saves nothing when the traveller leaves after answering (AC13)', async () => {
    const fetchMock = withProfile(BLANK)
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Citizenship', 'Ireland')
    fireEvent.click(screen.getByRole('button', { name: 'Leave set-up' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Leave set-up?' })).getByRole('button', {
        name: 'Leave',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    expect(puts(fetchMock)).toHaveLength(0)
  })

  it('saves no profile answers when the trip cannot be created (AC13)', async () => {
    const fetchMock = withProfile(BLANK, { 'POST /trips': { status: 500 } })
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Citizenship', 'Ireland')
    type('Residence', 'Portugal')
    cont()
    await screen.findByLabelText('Destination')
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText("We couldn't save this trip. Try again.")).toBeInTheDocument()
    expect(puts(fetchMock)).toHaveLength(0)
  })

  it('still opens the new trip when the profile cannot be saved', async () => {
    withProfile(BLANK, { 'PUT /profile': { status: 500 } })
    renderAt('/trips/new')
    await screen.findByLabelText('Citizenship')
    type('Citizenship', 'Ireland')
    type('Residence', 'Portugal')
    cont()
    await screen.findByLabelText('Destination')
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByRole('heading', { name: 'Shortlists' })).toBeInTheDocument()
  })

  it('says so, with no Continue, when the profile cannot be loaded', async () => {
    stubApi({ ...replies, 'GET /profile': { status: 500 } })
    renderAt('/trips/new')
    expect(await screen.findByText(/We couldn't load your profile/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })
})
