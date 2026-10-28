import { fireEvent, render, screen } from '@testing-library/react'
import { RecommendationImage } from './RecommendationImage'

it('never requests an outside host', () => {
  render(<RecommendationImage src="https://picsum.photos/seed/a/400/300" name="Tile Museum" appOnly />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/rec/placeholder.svg')
})

it('rejects protocol-relative hosts', () => {
  render(<RecommendationImage src="//img.example/a.jpg" name="Tile Museum" appOnly />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/rec/placeholder.svg')
})

it('shows an app image as is', () => {
  render(<RecommendationImage src="/rec/tile-museum-local.svg" name="Tile Museum" appOnly />)
  expect(screen.getByRole('img', { name: 'Tile Museum photo' })).toHaveAttribute(
    'src',
    '/rec/tile-museum-local.svg',
  )
  expect(screen.getByText('Saved in app')).toBeVisible()
})

it('falls back to the placeholder when the file fails to load', () => {
  render(<RecommendationImage src="/rec/gone.svg" name="Tile Museum" appOnly />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveAttribute('src', '/rec/placeholder.svg')
  expect(screen.getByText('Photo not available')).toBeVisible()
})

it('shows the neutral placeholder when there is no image', () => {
  render(<RecommendationImage src={null} name="Tile Museum" appOnly />)
  expect(screen.getByText('Photo not available')).toBeVisible()
  expect(screen.getByRole('img', { name: 'No photo available for Tile Museum' })).toBeVisible()
})

it('leaves the source alone when not in local mode', () => {
  render(<RecommendationImage src="https://img.example/a.jpg" name="A" appOnly={false} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img.example/a.jpg')
})
