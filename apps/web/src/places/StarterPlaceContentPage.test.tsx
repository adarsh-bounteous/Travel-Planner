import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const tokyo = {
  name: 'Tokyo',
  places: [{ name: 'Senso-ji Temple', note: "Tokyo's oldest temple" }],
  restaurants: [{ name: 'Ichiran Shibuya', note: 'Solo ramen booths' }],
  stays: [{ name: 'Hotel Gracery', note: 'Near the station', price_per_night: 118, currency: 'USD' }],
  activities: [{ name: 'teamLab Planets', note: 'Digital art' }],
  medical_guidance: 'Tap water is safe.',
}
const url = '/trips/plan/Japan/Tokyo'
const sectionOf = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!

describe('Starter place content page', () => {
  it('shows all five sections filled, with stay prices in their currency (AC5-AC9)', async () => {
    stubApi({ 'GET /starter-destinations/Japan/Tokyo': { status: 200, body: tokyo } })
    renderAt(url)
    for (const title of [
      'Sample places',
      'Sample restaurants',
      'Sample stays',
      'Sample activities',
      'Medical guidance',
    ])
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    for (const title of ['Sample places', 'Sample restaurants', 'Sample activities'])
      expect(within(sectionOf(title)).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1)
    expect(within(sectionOf('Sample stays')).getByText(/\$118\.00 \/ night/)).toBeInTheDocument()
    expect(sectionOf('Medical guidance')).toHaveTextContent('Tap water is safe.')
    expect(screen.getByRole('heading', { name: 'Tokyo', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Japan', { selector: 'li' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to trip' })).toHaveAttribute('href', '/trips/plan')
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
  })

  it('returns to the planner with the picks restored from Back to trip', async () => {
    stubApi({
      'GET /starter-destinations/Japan/Tokyo': { status: 200, body: tokyo },
      'GET /starter-destinations': {
        status: 200,
        body: [{ name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] }],
      },
    })
    renderAt(url)
    fireEvent.click(await screen.findByRole('link', { name: 'Back to trip' }))
    expect(await screen.findByRole('heading', { name: 'Plan a trip' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /destination/i })).toHaveTextContent('Japan')
    expect(screen.getByRole('button', { name: /place/i })).toHaveTextContent('Tokyo')
  })

  it('shows a busy skeleton while loading', async () => {
    // The content request never answers, so the loading state stays on screen.
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/auth/me'
          ? Promise.resolve(
              new Response(JSON.stringify({ email: 'maya@example.com', method: 'email' }), { status: 200 }),
            )
          : new Promise<Response>(() => {}),
      ),
    )
    renderAt(url)
    await screen.findByRole('heading', { name: 'Tokyo', level: 2 })
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('shows a danger alert when the content cannot load', async () => {
    stubApi({ 'GET /starter-destinations/Japan/Tokyo': { status: 500 } })
    renderAt(url)
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
  })
})
