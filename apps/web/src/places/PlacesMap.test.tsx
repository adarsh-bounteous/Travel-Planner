import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Place } from './api'
import { PlacesMap } from './PlacesMap'
import { fitView, visibleTiles } from './tileMath'

afterEach(() => vi.unstubAllGlobals())

const place = (id: string, name: string, lat: number, lng: number): Place => ({
  id,
  name,
  image_url: '/x.jpg',
  place_type: 'landmark',
  price: 'free',
  lat,
  lng,
})
const PLACES = [place('a', 'Alpha', 10, 0), place('b', 'Bravo', 20, 10), place('c', 'Charlie', 15, 5)]

const stub = (tiles: boolean | 'reject') => {
  const fetchMock = vi.fn(async (path: string) => {
    if (path === '/startup-status') {
      if (tiles === 'reject') throw new Error('offline')
      return new Response(JSON.stringify({ map_tiles: tiles }))
    }
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const hrefs = () => screen.queryAllByTestId('map-tile').map((t) => t.getAttribute('href'))
const tileHref = (t: { z: number; x: number; y: number }) => `/places/tiles/${t.z}/${t.x}/${t.y}.png`
const initial = fitView(PLACES, 400, 300)
const expected = (view = initial) =>
  new Set(visibleTiles(view.center, view.zoom, 400, 300).map(tileHref))

describe('PlacesMap with tiles on', () => {
  it('shows OSM tiles for the visible area only (AC1, AC7)', async () => {
    stub(true)
    render(<PlacesMap places={PLACES} />)
    const tiles = await screen.findAllByTestId('map-tile')
    expect(tiles[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/places\/tiles\/\d+\/\d+\/\d+\.png$/),
    )
    expect(new Set(hrefs())).toEqual(expected())
  })

  it('shows the attribution link (AC3)', async () => {
    stub(true)
    render(<PlacesMap places={PLACES} />)
    const link = await screen.findByRole('link', { name: /openstreetmap contributors/i })
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('zooming requests only the new visible tiles (AC6)', async () => {
    stub(true)
    render(<PlacesMap places={PLACES} />)
    await screen.findAllByTestId('map-tile')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    const zoomed = { ...initial, zoom: initial.zoom + 1 }
    await waitFor(() => expect(new Set(hrefs())).toEqual(expected(zoomed)))
  })

  it('panning requests only the new visible tiles (AC6)', async () => {
    stub(true)
    render(<PlacesMap places={PLACES} />)
    const [first] = await screen.findAllByTestId('map-tile')
    const svg = first.closest('svg')!
    act(() => {
      fireEvent.pointerDown(svg, { clientX: 300, clientY: 100, pointerId: 1 })
      fireEvent.pointerMove(svg, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(svg, { pointerId: 1 })
    })
    await waitFor(() => expect(new Set(hrefs())).not.toEqual(expected()))
    for (const h of hrefs()) expect(h).toMatch(/^\/places\/tiles\/\d+\/\d+\/\d+\.png$/)
  })
})

describe.each([false, 'reject'] as const)('PlacesMap with tiles off (%s)', (mode) => {
  it('makes no tile request and shows no imagery or attribution (AC2, AC3, AC8)', async () => {
    const fetchMock = stub(mode)
    render(<PlacesMap places={PLACES} />)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/startup-status', expect.anything()),
    )
    expect(screen.queryAllByTestId('map-tile')).toHaveLength(0)
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('/places/tiles'))).toBe(true)
    expect(document.querySelector('image')).toBeNull()
    expect(screen.queryByText(/openstreetmap/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()
  })

  it('keeps the local layout, markers and labels (AC9)', async () => {
    const fetchMock = stub(mode)
    render(<PlacesMap places={PLACES} savedIds={new Set(['b'])} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByText('Saved place')).toBeInTheDocument()
    expect(screen.getByText('Not saved')).toBeInTheDocument()
    const pins = screen.getAllByRole('listitem')
    expect(pins.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Alpha, not saved',
      'Bravo, saved',
      'Charlie, not saved',
    ])
    expect(pins.map((p) => p.getAttribute('transform'))).toEqual([
      'translate(30 270)',
      'translate(370 30)',
      'translate(200 150)',
    ])
    expect(pins.map((p) => p.getAttribute('data-saved'))).toEqual(['false', 'true', 'false'])
  })
})
