import { fireEvent, render, screen } from '@testing-library/react'
import type { Place } from './api'
import { PlaceCard } from './PlaceCard'

const alfama: Place = {
  id: 'p1',
  name: 'Alfama',
  image_url: 'https://img.example/a.jpg',
  place_type: 'landmark',
  price: 'free',
  lat: 38.711,
  lng: -9.13,
}

const renderCard = (props: Partial<Parameters<typeof PlaceCard>[0]> = {}) =>
  render(
    <ul>
      <PlaceCard place={alfama} saved={false} onToggleSave={() => {}} {...props} />
    </ul>,
  )

describe('PlaceCard', () => {
  it('has a gradient cover with no photo or text on it (AC1, AC2, AC12)', () => {
    renderCard({ saved: true })
    expect(screen.getByTestId('place-cover')).toBeEmptyDOMElement()
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })

  it('shows save and add-to-trip controls (AC7, AC8)', () => {
    const onAdd = vi.fn()
    renderCard({ onAdd })
    expect(screen.getByRole('button', { name: 'Save Alfama' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Add Alfama to trip' }))
    expect(onAdd).toHaveBeenCalledWith(alfama)
  })

  it('leaves out add-to-trip when no handler is given', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: 'Add Alfama to trip' })).not.toBeInTheDocument()
  })
})
