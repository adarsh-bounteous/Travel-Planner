import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const trip = {
  id: 't1',
  name: 'Lisbon trip',
  destination: 'Lisbon, Portugal',
  start_date: '2027-04-03',
  end_date: '2027-04-12',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [],
  travellers: [],
  editors: [],
}
const NOTE = 'Confirm with official sources before you travel.'

const base = {
  citizenship: 'Canada',
  residence: 'Canada',
  tests: [] as string[],
  vaccinations: [] as { name: string; status: string }[],
  advisories: [] as string[],
  health_details_given: false,
  official_site_url: null as string | null,
  confirm_note: NOTE,
}
const maya = {
  ...base,
  traveller_id: null,
  name: 'Maya Chen',
  result: 'guidance',
  health_details_given: true,
  vaccinations: [
    { name: 'Hepatitis A', status: 'already_had' },
    { name: 'MMR booster', status: 'unsuitable_in_pregnancy' },
    { name: 'Tetanus booster', status: 'recommended' },
  ],
  advisories: ['General health advisory for Portugal', 'Pregnancy advisory'],
}
const tom = {
  ...base,
  traveller_id: 'b',
  name: 'Tom Reyes',
  citizenship: 'India',
  residence: 'India',
  result: 'guidance',
  tests: ['TB screening'],
  vaccinations: [{ name: 'Typhoid', status: 'required' }],
  advisories: ['General health advisory for Portugal'],
}

const open = (rows: unknown[]) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/medical-guidance': { status: 200, body: rows },
  })
  renderAt('/trips/t1/medical-guidance')
}

describe('Medical guidance', () => {
  it('shows each traveller under their own name with the confirm note (AC1, AC5, AC11)', async () => {
    open([maya, tom])
    expect(await screen.findByRole('heading', { name: 'Maya Chen', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tom Reyes', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Medical guidance for Portugal' })).toBeInTheDocument()
    expect(screen.getByText('TB screening')).toBeInTheDocument()
    expect(screen.getByText('Lives in India, India citizen')).toBeInTheDocument()
    expect(screen.getAllByText(NOTE)).toHaveLength(2)
  })

  it('labels vaccination statuses with words (AC3, AC9)', async () => {
    open([maya, tom])
    await screen.findByText('Maya Chen')
    expect(screen.getAllByText('Unsuitable in pregnancy').length).toBeGreaterThan(0)
    expect(screen.getByText('Already had')).toBeInTheDocument()
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('says when a traveller has no health details (AC4)', async () => {
    open([maya, tom])
    expect(
      await screen.findByText("Tom Reyes hasn't added health details, so you see the general advisories only."),
    ).toBeInTheDocument()
  })

  it('shows no data with the official site link (AC6, AC7, AC11)', async () => {
    open([{ ...base, traveller_id: null, name: 'You', result: 'no_data', official_site_url: 'https://www.portugal.gov.pt/' }])
    expect(await screen.findByText(/No data for this route/, { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Official government travel site' })).toHaveAttribute(
      'href',
      'https://www.portugal.gov.pt/',
    )
    expect(screen.getAllByText(NOTE)).toHaveLength(1)
  })

  it('shows nothing required (AC12, AC11)', async () => {
    open([{ ...base, traveller_id: null, name: 'You', result: 'none_required' }])
    expect(await screen.findByText('No medical requirements apply to this trip')).toBeInTheDocument()
    expect(screen.getAllByText(NOTE)).toHaveLength(1)
  })

  it('shows a loading state, then a failure alert with Retry', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip },
      'GET /trips/t1/medical-guidance': { status: 500, body: {} },
    })
    renderAt('/trips/t1/medical-guidance')
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('links to the traveller profile', async () => {
    open([tom])
    fireEvent.focus(await screen.findByRole('link', { name: 'Update health details in your profile' }))
    expect(screen.getByRole('link', { name: 'Update health details in your profile' })).toHaveAttribute('href', '/account')
  })
})
