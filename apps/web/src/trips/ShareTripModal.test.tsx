import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  is_owner: true,
  can_edit: true,
  days: [{ date: '2027-03-03', name: 'Day 1' }],
  ...overrides,
})

const withLink = trip({ share_url: '/trips/read-only/k7Qm2xVd9' })

const openModal = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Share trip' }))
  return screen.findByRole('dialog', { name: 'Share trip' })
}

describe('Share trip modal', () => {
  it('shows a read-only link after the owner creates one (AC1)', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'POST /trips/t1/share-link': { status: 201, body: withLink },
    })
    renderAt('/trips/t1')
    await openModal()
    expect(screen.getByText(/Anyone with a read-only link can view the itinerary/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Create read-only link' }))
    expect(await screen.findByLabelText('Read-only link')).toHaveValue(
      `${window.location.origin}/trips/read-only/k7Qm2xVd9`,
    )
    expect(screen.getByRole('button', { name: 'Turn off link' })).toBeInTheDocument()
    expect(await screen.findByText('Read-only link created.')).toBeInTheDocument()
  })

  it('opens already showing an existing link', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: withLink } })
    renderAt('/trips/t1')
    await openModal()
    expect(screen.getByLabelText('Read-only link')).toHaveValue(
      `${window.location.origin}/trips/read-only/k7Qm2xVd9`,
    )
  })

  it('copies the link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    stubApi({ 'GET /trips/t1': { status: 200, body: withLink } })
    renderAt('/trips/t1')
    await openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByText('Link copied.')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/trips/read-only/k7Qm2xVd9`)
  })

  it('turns the link off and goes back to the no-link state (AC4)', async () => {
    const fetchMock = stubApi({
      'GET /trips/t1': { status: 200, body: withLink },
      'DELETE /trips/t1/share-link': { status: 200, body: trip({ share_url: null }) },
    })
    renderAt('/trips/t1')
    await openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off link' }))
    expect(await screen.findByRole('button', { name: 'Create read-only link' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Read-only link')).not.toBeInTheDocument()
    expect(await screen.findByText('Link turned off.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/trips/t1/share-link', expect.objectContaining({ method: 'DELETE' }))
  })

  it('says what happened when the link cannot be created', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'POST /trips/t1/share-link': { status: 500 },
    })
    renderAt('/trips/t1')
    await openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Create read-only link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't create that link. Try again.",
    )
  })

  it('closes with the Close button', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip() } })
    renderAt('/trips/t1')
    await openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Share trip' })).not.toBeInTheDocument()
  })
})
