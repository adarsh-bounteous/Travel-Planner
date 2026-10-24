import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const trip = {
  id: 't1',
  name: 'Lisbon long weekend',
  destination: 'Lisbon',
  budget: 1800,
  currency: 'EUR',
  traveller_count: 2,
}

describe('ShortlistsPage', () => {
  it('shows the trip summary and the Places tab first (AC7)', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip } })
    renderAt('/trips/t1/shortlists')
    expect(await screen.findByRole('heading', { name: 'Shortlists' })).toBeInTheDocument()
    expect(
      screen.getByText(/Lisbon long weekend is ready: Lisbon, 2 travellers, budget .*1,800.*\. Trip currency: EUR\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Places' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Places to consider' })).toBeInTheDocument()
  })

  it('switches between the shortlists', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip } })
    renderAt('/trips/t1/shortlists')
    fireEvent.click(await screen.findByRole('tab', { name: 'Stays' }))
    expect(screen.getByRole('heading', { name: 'Stays to consider' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Stays' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Activities' })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers Retry when the trip does not load', async () => {
    stubApi({ 'GET /trips/t1': { status: 500 } })
    renderAt('/trips/t1/shortlists')
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
