import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('reserves a 16:9 frame before the art loads (AC9, AC10)', () => {
    const { container } = renderCard({ saved: true })
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    expect(container.querySelector('.imgc img')).toBeNull()
  })

  it('shows the place type art hidden from screen readers (AC4, AC12)', async () => {
    const { container } = renderCard({ place: { ...alfama, place_type: 'park' } })
    await waitFor(() => expect(container.querySelector('.imgc img')).not.toBeNull())
    expect(container.querySelector('.imgc img')).toHaveAttribute('aria-hidden', 'true')
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
