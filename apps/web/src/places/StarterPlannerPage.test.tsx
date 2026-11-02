import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const catalogue = [
  { name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] },
  { name: 'Portugal', places: ['Lisbon', 'Porto', 'Lagos'] },
]
const TOKYO = { id: 'starter:Japan/Tokyo', name: 'Tokyo', region: 'Japan', kind: 'starter', fullGuide: true }
const AGRA = { id: 'live:agra.sig', name: 'Agra', region: 'Uttar Pradesh, India', kind: 'live', fullGuide: false }
const search = (q: string, match: object) => ({
  [`GET /places/search?q=${q}`]: { status: 200, body: { live: true, unavailable: false, matches: [match] } },
})
const replies = {
  'GET /starter-destinations': { status: 200, body: catalogue },
  ...search('Tokyo', TOKYO),
  ...search('Agra', AGRA),
}

async function pick(q: string, name: RegExp) {
  fireEvent.change(await screen.findByRole('searchbox', { name: 'Destination' }), { target: { value: q } })
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('Starter planner page', () => {
  it('searches for a destination instead of two dropdowns (AC1)', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    expect(await screen.findByRole('searchbox', { name: 'Destination' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /destination/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeDisabled()
  })

  it('opens the place content page from a starter pick', async () => {
    stubApi({
      ...replies,
      'GET /starter-destinations/Japan/Tokyo': {
        status: 200,
        body: { name: 'Tokyo', places: [], restaurants: [], stays: [], activities: [], medical_guidance: '' },
      },
    })
    renderAt('/trips/plan')
    await pick('Tokyo', /Tokyo/)
    expect(await screen.findByText(/Starter content ready for Tokyo/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View place content' })).toHaveAttribute(
      'href',
      '/trips/plan/Japan/Tokyo',
    )
    fireEvent.click(screen.getByRole('link', { name: 'View place content' }))
    expect(await screen.findByRole('heading', { name: 'Tokyo', level: 2 })).toBeInTheDocument()
  })

  it('keeps place content off for a live pick but lets it be booked (AC1)', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    await pick('Agra', /Agra/)
    expect(
      await screen.findByText('Only starter destinations have place content. You can still book this trip.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Starter content ready/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View place content' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: 'View place content' })).not.toHaveAttribute('href')
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeEnabled()
  })

  it('completes Book trip with a confirmation once a place is picked (AC10)', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    await pick('Tokyo', /Tokyo/)
    fireEvent.click(screen.getByRole('button', { name: 'Book trip' }))
    expect(await screen.findByText('Trip booked: Tokyo, Japan')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Booking complete' })).toHaveClass('is-playing')
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeEnabled()
  })

  it('says what happened when the catalogue cannot load', async () => {
    stubApi({ 'GET /starter-destinations': { status: 500 } })
    renderAt('/trips/plan')
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
  })
})
