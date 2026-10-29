import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { AuthProvider } from '../auth/AuthProvider'
import { stubApi } from '../test-api'
import type { Recommendation } from './api'
import { TripRecommendationsTab } from './TripRecommendationsTab'

afterEach(() => vi.unstubAllGlobals())

const place = (id: string, name: string) => ({
  id,
  name,
  image_url: `https://img.example/${id}.jpg`,
  place_type: 'food' as const,
  price: 'budget' as const,
  lat: 1,
  lng: 2,
})
const rec = (id: string, name: string, interest: string): Recommendation => ({
  id,
  name,
  detail: 'About 1 hour',
  interest,
  place: place(id, name),
})
const RECS = [
  rec('tom', 'Time Out Market tasting hour', 'Food'),
  rec('tile', 'Tile Museum', 'Culture'),
  rec('cabo', 'Cabo da Roca viewpoint', 'Outdoors'),
]

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const LISBON = { country: 'Portugal', place: 'Lisbon', label: 'Lisbon, Portugal' }

function open(
  recs: Recommendation[],
  extra: Record<string, { status: number; body?: unknown }> = {},
  view: { destination: typeof LISBON | null; status: string } = { destination: LISBON, status: 'ready' },
) {
  const fetchMock = stubApi({
    'GET /trips/t1/recommendations': { status: 200, body: { ...view, items: recs } },
    'PUT /saved-places/tom': { status: 200, body: place('tom', 'Time Out Market tasting hour') },
    'GET /saved-places': { status: 200, body: [] },
    ...extra,
  })
  render(
    <MemoryRouter>
      <AuthProvider>
        <TripRecommendationsTab
          tripId="t1"
          interests={['Food', 'Culture', 'Outdoors']}
          onBack={() => {}}
        />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  )
  return fetchMock
}

describe('TripRecommendationsTab', () => {
  it('lists the recommendations and filters by interest chip (AC1, AC4)', async () => {
    open(RECS)
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Food', pressed: true }))
    expect(screen.queryByText('Time Out Market tasting hour')).not.toBeInTheDocument()
  })

  it('asks for an interest when every chip is deselected', async () => {
    open([RECS[0]])
    await screen.findByText('Time Out Market tasting hour')
    for (const name of ['Food', 'Culture', 'Outdoors'])
      fireEvent.click(screen.getByRole('button', { name, pressed: true }))
    expect(screen.getByText('Pick an interest to see ideas')).toBeInTheDocument()
  })

  it('shows an empty message with no recommendations (AC2)', async () => {
    open([])
    expect(
      await screen.findByText('No recommendations for this destination yet'),
    ).toBeInTheDocument()
  })

  it('says the recommendations come from the service when local mode is off (AC6)', async () => {
    open(RECS)
    expect(await screen.findByText('From the recommendation service.')).toBeInTheDocument()
  })

  it('says the recommendations are generated locally when local mode is on (AC5)', async () => {
    open(RECS, { 'GET /startup-status': { status: 200, body: { local_mode: true } } })
    expect(await screen.findByText('Generated locally.')).toBeInTheDocument()
  })

  it('opens a recommendation through the destination places view (AC7)', async () => {
    open(RECS)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Time Out Market tasting hour' }))
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/destinations?destination=Lisbon&q=Time%20Out%20Market%20tasting%20hour&trip=t1',
    )
    expect(screen.getByTestId('where')).not.toHaveTextContent('Portugal')
  })

  it('shows the chosen destination label (AC4, AC5)', async () => {
    open(RECS)
    expect(await screen.findByText('Destination: Lisbon, Portugal')).toBeInTheDocument()
  })

  it('asks to choose a destination when there is none (AC6, AC8)', async () => {
    open([], {}, { destination: null, status: 'no_destination' })
    expect(await screen.findByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument()
    expect(screen.queryByText('No recommendations for this destination yet')).not.toBeInTheDocument()
  })

  it('says there is no information for a place with no data (AC9)', async () => {
    open([], {}, { destination: LISBON, status: 'no_place_data' })
    expect(await screen.findByText('No information available for this place')).toBeInTheDocument()
  })

  it('saves through the saved-places call (AC8)', async () => {
    const fetchMock = open(RECS)
    fireEvent.click(await screen.findByRole('button', { name: 'Save Time Out Market tasting hour' }))
    expect(
      await screen.findByRole('button', { name: 'Saved Time Out Market tasting hour' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(fetchMock.mock.calls.map(([p, i]) => `${i?.method ?? 'GET'} ${p}`)).toContainEqual(
      expect.stringMatching(/^PUT \/saved-places\//),
    )
  })

  it.each([true, false])('shows gradient covers and no photo (local mode %s)', async (local_mode) => {
    open(RECS, { 'GET /startup-status': { status: 200, body: { local_mode } } })
    expect((await screen.findAllByTestId('place-cover')).length).toBeGreaterThan(0)
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })
})
