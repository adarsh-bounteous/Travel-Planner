import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { Place } from './api'
import { PlaceDetails } from './PlaceDetails'

const osm: Place = {
  id: 'osm-node-42',
  name: 'Museu X',
  image_url: 'data:image/svg+xml,x',
  place_type: 'museum',
  price: null,
  lat: 38.7,
  lng: -9.1,
  category: 'museums',
  address: '1 Rua X, Lisbon',
  opening_hours: 'Mo-Fr 09:00-17:00',
  source: 'osm',
  provider_id: 'node/42',
  url: 'https://www.openstreetmap.org/node/42',
}

describe('PlaceDetails', () => {
  it('shows address, coordinates, provider id, OSM link and hours (AC5, AC6)', () => {
    render(<PlaceDetails place={osm} onClose={() => {}} />)
    expect(screen.getByText('1 Rua X, Lisbon')).toBeInTheDocument()
    expect(screen.getByText('38.7, -9.1')).toBeInTheDocument()
    expect(screen.getByText('node/42')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /openstreetmap\.org\/node\/42/ })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/node/42',
    )
    expect(screen.getByText('Mo-Fr 09:00-17:00')).toBeInTheDocument()
  })

  it('shows no opening hours when none are tagged (AC7)', () => {
    render(<PlaceDetails place={{ ...osm, opening_hours: null }} onClose={() => {}} />)
    expect(screen.queryByText(/opening hours/i)).not.toBeInTheDocument()
  })

  it('shows no rating, price or photo (AC8)', () => {
    render(<PlaceDetails place={osm} onClose={() => {}} />)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(screen.queryByText(/rating|price|free|budget|moderate|premium/i)).not.toBeInTheDocument()
  })

  it('does not link a non-https url', () => {
    render(<PlaceDetails place={{ ...osm, url: 'javascript:alert(1)' }} onClose={() => {}} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('closes', () => {
    const onClose = vi.fn()
    render(<PlaceDetails place={osm} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
