import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const trip = {
  id: 't1',
  name: 'Kyoto in spring',
  destination: 'Kyoto, Japan',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [],
  travellers: [{ id: 'a', name: 'Ana' }],
  editors: [],
}

const row = (name: string, status: string | null, extra = {}) => ({
  traveller_id: name === 'You (owner)' ? null : name.toLowerCase(),
  name,
  citizenship: 'Canada',
  residence: 'Canada',
  status,
  message: null,
  confirm_note: null,
  official_site_url: null,
  marked_self_check: false,
  unresolved: false,
  guidance: null,
  ...extra,
})

const required = row('Ana', 'required', {
  message: 'A visa is required for Japan.',
  confirm_note: 'Confirm with official sources.',
})
const notNeeded = row('Ben', 'not_needed', {
  message: 'No visa is needed for Japan.',
  confirm_note: 'Confirm with official sources.',
})
const noData = row('Chen', 'no_data', {
  message: "We have no visa data for China to Japan, so we can't say whether you need one.",
  official_site_url: 'https://example.test/japan',
})

const open = (travellers: unknown[], extra: Record<string, { status: number; body?: unknown }> = {}) => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/visa': {
      status: 200,
      body: { destination: 'Japan', published_on: '2026-10-20', travellers },
    },
    ...extra,
  })
  renderAt('/trips/t1/visa-requirements')
}

describe('Visa requirements', () => {
  it('shows each traveller verdict with the confirm note', async () => {
    open([required, notNeeded])
    expect(await screen.findByText('Visa required')).toBeInTheDocument()
    expect(screen.getByText('No visa needed')).toBeInTheDocument()
    expect(screen.getByText('A visa is required for Japan.')).toBeInTheDocument()
    expect(screen.getByText('No visa is needed for Japan.')).toBeInTheDocument()
    expect(screen.getAllByText('Confirm with official sources.')).toHaveLength(2)
    expect(screen.queryByText('No data for this route')).not.toBeInTheDocument()
  })

  it('shows the no-data card with the official link and no advisory', async () => {
    open([noData])
    expect(await screen.findByText('No data for this route')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Japan official government site' })).toHaveAttribute(
      'href',
      'https://example.test/japan',
    )
    const card = screen.getByRole('article')
    expect(within(card).queryByText(/advisory|travel warning/i)).not.toBeInTheDocument()
    expect(within(card).queryByText('Confirm with official sources.')).not.toBeInTheDocument()
  })

  it('links to an official-site search for a destination outside the known list', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip },
      'GET /trips/t1/visa': {
        status: 200,
        body: {
          destination: 'Peru',
          published_on: '2026-10-20',
          travellers: [{ ...noData, official_site_url: 'https://example.test/search?q=Peru' }],
        },
      },
    })
    renderAt('/trips/t1/visa-requirements')
    expect(await screen.findByRole('link', { name: 'Peru official government site' })).toHaveAttribute(
      'href',
      'https://example.test/search?q=Peru',
    )
  })

  it("marks I'll check myself", async () => {
    const marked = { ...noData, marked_self_check: true, unresolved: true }
    open([noData], {
      'PUT /trips/t1/visa/chen/self-check': {
        status: 200,
        body: { destination: 'Japan', published_on: '2026-10-20', travellers: [marked] },
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: "I'll check myself" }))
    expect(await screen.findByText('Visa marked as "I\'ll check myself"')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "I'll check myself" })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('refreshes the rules and shows the new published date', async () => {
    open([required])
    expect(await screen.findByText(/Rules published by provider on .*2026/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh rules' }))
    expect(screen.getByRole('status', { name: 'Loading visa rules' })).toBeInTheDocument()
    expect(
      await screen.findByText('Rules updated. Results use the latest published rules.'),
    ).toBeInTheDocument()
  })

  it('shows the guidance for the selected country', async () => {
    open([
      row('Ana', 'not_needed', {
        message: 'No visa is needed for Peru.',
        confirm_note: 'Confirm with official sources.',
        guidance: {
          country: 'Peru',
          entry_requirement: 'No visa is needed to enter Peru for a short visit.',
          max_stay: '183 days',
          documents: ['Valid passport', 'Return ticket'],
        },
      }),
    ])
    expect(await screen.findByText(/Visa guidance for Peru/)).toBeInTheDocument()
    expect(screen.getByText(/Entry requirement/i)).toBeInTheDocument()
    expect(screen.getByText('183 days')).toBeInTheDocument()
    expect(screen.getByText(/Maximum stay/i)).toBeInTheDocument()
    expect(screen.getByText(/Required documents/i)).toBeInTheDocument()
    expect(screen.getByText('Return ticket')).toBeInTheDocument()
    expect(screen.queryByText(/We have no visa data/)).not.toBeInTheDocument()
  })

  it('shows no guidance headings on a no-data card', async () => {
    open([noData])
    expect(await screen.findByText(/We have no visa data/)).toBeInTheDocument()
    expect(screen.queryByText(/Maximum stay/i)).not.toBeInTheDocument()
  })

  it('offers Enter details when citizenship is blank', async () => {
    open([{ ...row('Ana', null), traveller_id: 'a', citizenship: '', residence: '' }])
    fireEvent.click(await screen.findByRole('button', { name: 'Enter details for Ana' }))
    expect(await screen.findByRole('dialog', { name: 'Ana' })).toBeInTheDocument()
  })

  it('says what to do when the rules fail to load', async () => {
    stubApi({})
    renderAt('/trips/t1/visa-requirements')
    expect(
      await screen.findByText("We couldn't load the visa requirements. Try again."),
    ).toBeInTheDocument()
  })
})
