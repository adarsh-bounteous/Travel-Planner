import { render, screen } from '@testing-library/react'
import type { Place } from './api'
import { PlacesSourceNote } from './PlacesSourceNote'

const seed: Place = {
  id: 'p1',
  name: 'Alfama',
  image_url: 'https://img.example/a.jpg',
  place_type: 'landmark',
  price: 'free',
  lat: 1,
  lng: 2,
  source: 'seed',
  as_of: '2026-10-31',
}
const osm: Place = { ...seed, id: 'osm-node-1', price: null, source: 'osm', as_of: null }

describe('PlacesSourceNote', () => {
  it('shows nothing while places load', () => {
    const { container } = render(<PlacesSourceNote places={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('credits OpenStreetMap when a place comes from it (AC3)', () => {
    render(<PlacesSourceNote places={[osm]} />)
    expect(screen.getByRole('link', { name: /OpenStreetMap contributors/ })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    )
    expect(screen.queryByText(/Live data unavailable/)).not.toBeInTheDocument()
  })

  it('shows the notice with the as-of date and no attribution for seed places (AC11, AC13)', () => {
    render(<PlacesSourceNote places={[seed]} />)
    expect(screen.getByText(/Live data unavailable, showing saved data/)).toBeInTheDocument()
    expect(screen.getByText(/2026-10-31/)).toBeInTheDocument()
    expect(screen.queryByText(/OpenStreetMap contributors/)).not.toBeInTheDocument()
  })

  it('shows the notice for an empty list', () => {
    render(<PlacesSourceNote places={[]} />)
    expect(screen.getByText(/Live data unavailable/)).toBeInTheDocument()
  })
})
