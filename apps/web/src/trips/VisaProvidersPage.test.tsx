import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const JAPAN = { country: 'Japan', place: 'Kyoto', label: 'Kyoto, Japan' }

const person = (name: string, key: string | null) => ({
  traveller_id: key,
  name,
  citizenship: 'India',
  residence: 'India',
  status: 'required',
  message: null,
  confirm_note: null,
  official_site_url: null,
  marked_self_check: false,
  unresolved: false,
  guidance: null,
  visa_type: 'tourist',
})

const visa = {
  destination: JAPAN,
  status: 'ready',
  published_on: '2026-10-20',
  travellers: [person('Ana', 'ana'), person('Ben', 'ben')],
}

const option = (id: string, name: string, source: string, over = {}) => ({
  id,
  name,
  source,
  fee: '25',
  currency: 'GBP',
  processing_days: 5,
  offers: 'Express option',
  url: `https://example.com/visa/${id}`,
  ...over,
})

const providerView = (over = {}) => ({
  outcome: 'shortlist',
  traveller_id: 'ana',
  name: 'Ana',
  destination: JAPAN,
  visa_type: 'tourist',
  citizenship: 'India',
  matching_count: 5,
  providers: [
    option('a', 'Provider A', 'web_search'),
    option('b', 'Provider B', 'partner', { fee: '30', processing_days: 1, offers: null }),
    option('c', 'Provider C', 'partner', { url: 'javascript:alert(1)' }),
  ],
  message: null,
  official_site_url: null,
  ...over,
})

const open = (body: unknown, extra: Record<string, { status: number; body?: unknown }> = {}) => {
  const fetchMock = stubApi({
    'GET /trips/t1/visa': { status: 200, body: visa },
    'GET /trips/t1/visa/ana/providers': { status: 200, body },
    ...extra,
  })
  renderAt('/trips/t1/visa-providers')
  return fetchMock
}

describe('Visa providers', () => {
  it('shows the shortlist with fee, processing time and offers for each provider', async () => {
    open(providerView())
    const card = await screen.findByRole('article', { name: 'Provider A' })
    expect(within(card).getByText('Service fee')).toBeInTheDocument()
    expect(within(card).getByText('GBP 25.00')).toBeInTheDocument()
    expect(within(card).getByText('5 working days')).toBeInTheDocument()
    expect(within(card).getByText('Express option')).toBeInTheDocument()
    expect(within(card).getByText('Web search')).toBeInTheDocument()
    const other = screen.getByRole('article', { name: 'Provider B' })
    expect(within(other).getByText('Partner API')).toBeInTheDocument()
    expect(within(other).getByText('None')).toBeInTheDocument()
    expect(screen.getByText(/Showing 3 of 5 matching providers/)).toBeInTheDocument()
    expect(screen.getByText('Confirm with official sources.')).toBeInTheDocument()
  })

  it('opens the provider booking link in a new tab, and shows no link for an unsafe url', async () => {
    open(providerView())
    const pick = within(await screen.findByRole('article', { name: 'Provider A' })).getByRole('link', {
      name: 'Pick and book',
    })
    expect(pick).toHaveAttribute('href', 'https://example.com/visa/a')
    expect(pick).toHaveAttribute('target', '_blank')
    expect(pick).toHaveAttribute('rel', 'noopener noreferrer')
    const unsafe = screen.getByRole('article', { name: 'Provider C' })
    expect(within(unsafe).queryByRole('link', { name: 'Pick and book' })).not.toBeInTheDocument()
    expect(within(unsafe).getByText('No booking link is available for this option.')).toBeInTheDocument()
  })

  it('shows the no-data message with the official site link and an I\'ll check myself button', async () => {
    const fetchMock = open(
      providerView({
        outcome: 'no_data',
        providers: [],
        matching_count: 0,
        message: 'No providers for this route.',
        official_site_url: 'https://example.test/japan',
      }),
      { 'PUT /trips/t1/visa/ana/self-check': { status: 200, body: visa } },
    )
    expect(await screen.findByRole('heading', { name: 'No data for this route' })).toBeInTheDocument()
    expect(screen.getByText('No providers for this route.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Japan official government site' })).toHaveAttribute(
      'href',
      'https://example.test/japan',
    )
    expect(screen.queryByText('Pick and book')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "I'll check myself" }))
    expect(await screen.findByText('Visa marked as "I\'ll check myself"')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/trips/t1/visa/ana/self-check',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('shows no shortlist when no visa is needed', async () => {
    open(providerView({ outcome: 'no_visa_needed', providers: [], matching_count: 0 }))
    expect(await screen.findByText('No visa is needed for Ana for this trip.')).toBeInTheDocument()
    expect(screen.queryByText('Pick and book')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to visa requirements' })).toBeInTheDocument()
  })

  it('refetches for the traveller whose tab is chosen', async () => {
    const fetchMock = open(providerView(), {
      'GET /trips/t1/visa/ben/providers': {
        status: 200,
        body: providerView({ name: 'Ben', providers: [option('z', 'Provider Z', 'partner')] }),
      },
    })
    await screen.findByRole('article', { name: 'Provider A' })
    fireEvent.click(screen.getByRole('tab', { name: 'Ben' }))
    expect(await screen.findByRole('article', { name: 'Provider Z' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/trips/t1/visa/ben/providers', expect.anything())
  })

  it('shows a busy loading state, then an error with Retry', async () => {
    open(providerView(), { 'GET /trips/t1/visa/ana/providers': { status: 500 } })
    expect(screen.getAllByLabelText(/loading/i).length).toBeGreaterThan(0)
    expect(await screen.findByText("We couldn't load the visa providers. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
