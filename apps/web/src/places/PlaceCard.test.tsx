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
  it('shows 16:9 place-type art hidden from screen readers (AC4, AC9, AC12)', async () => {
    const { container } = renderCard({ saved: true })
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toMatch(/landmark\.svg/))
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('aria-hidden', 'true')
    expect(img).toHaveAttribute('alt', '')
  })

  it('uses the art of the place type (AC4)', async () => {
    const { container } = renderCard({ place: { ...alfama, place_type: 'park' } })
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toMatch(/park\.svg/))
  })

  it('shows save and add-to-trip controls (AC7, AC8)', () => {
    const onAdd = vi.fn()
    renderCard({ onAdd })
    expect(screen.getByRole('button', { name: 'Save Alfama' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Add Alfama to trip' }))
    expect(onAdd).toHaveBeenCalledWith(alfama)
  })

  it('pops the heart on save only (AC6, AC7)', () => {
    const { container, rerender } = renderCard({ saved: true })
    expect(container.querySelector('.heart-pop')).toBeNull()
    const card = (saved: boolean) => (
      <ul>
        <PlaceCard place={alfama} saved={saved} onToggleSave={() => {}} />
      </ul>
    )
    rerender(card(false))
    expect(container.querySelector('.heart-pop')).toBeNull()
    rerender(card(true))
    expect(container.querySelector('.heart-pop')).not.toBeNull()
    rerender(card(false))
    expect(container.querySelector('.heart-pop')).toBeNull()
  })

  it('leaves out add-to-trip when no handler is given', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: 'Add Alfama to trip' })).not.toBeInTheDocument()
  })
})
