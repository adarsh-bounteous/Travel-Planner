import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { stubApi } from '../test-api'
import { VisaSummaryCard } from './VisaSummaryCard'

afterEach(() => vi.unstubAllGlobals())

const row = (name: string, status: string, unresolved = false) => ({
  traveller_id: name.toLowerCase(),
  name,
  citizenship: 'India',
  residence: 'India',
  status,
  message: null,
  confirm_note: null,
  official_site_url: null,
  marked_self_check: unresolved,
  unresolved,
  guidance: null,
})

const show = (travellers: unknown[], unresolved: string[] = []) => {
  stubApi({
    'GET /trips/t1/visa': {
      status: 200,
      body: { destination: 'Japan', published_on: '2026-10-20', travellers },
    },
  })
  render(
    <MemoryRouter>
      <VisaSummaryCard tripId="t1" unresolved={unresolved} />
    </MemoryRouter>,
  )
}

describe('Visa summary card', () => {
  it('shows each traveller verdict before any booking', async () => {
    show([row('Ana', 'required'), row('Ben', 'not_needed')])
    expect(await screen.findByText('Visa required')).toBeInTheDocument()
    expect(screen.getByText('No visa needed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Visa requirements' })).toHaveAttribute(
      'href',
      '/trips/t1/visa-requirements',
    )
  })

  it('shows Unresolved and the plan-incomplete note', async () => {
    show([row('Ben', 'no_data', true)], ['Ben'])
    expect(await screen.findByText('Unresolved')).toBeInTheDocument()
    expect(screen.getByText("Plan incomplete: Ben's visa is still unresolved")).toBeInTheDocument()
  })

  it('names several people in the note', async () => {
    show([row('Ana', 'no_data', true), row('Ben', 'no_data', true)], ['Ana', 'Ben'])
    expect(
      await screen.findByText('Plan incomplete: visas for Ana and Ben are still unresolved'),
    ).toBeInTheDocument()
  })

  it('shows no note when nothing is unresolved', async () => {
    show([row('Ana', 'required')])
    await screen.findByText('Visa required')
    expect(screen.queryByText(/Plan incomplete/)).not.toBeInTheDocument()
  })
})
