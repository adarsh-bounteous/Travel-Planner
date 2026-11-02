import { render, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import { commonsPhoto, type Place } from './api'
import { PlaceCard } from './PlaceCard'
import { PhotoCredit } from './PlacesSourceNote'

afterEach(() => vi.unstubAllGlobals())

const THUMB = 'https://upload.wikimedia.org/a.jpg'
const PHOTO = { author: 'Ana', licence: 'CC BY 4.0', file_url: 'https://commons.wikimedia.org/wiki/File:A.jpg' }
const alfama: Place = {
  id: 'p1',
  name: 'Alfama',
  image_url: '/placeholder.svg',
  place_type: 'landmark',
  price: 'free',
  lat: 38.711,
  lng: -9.13,
}
const withPhoto: Place = { ...alfama, image_url: THUMB, photo: PHOTO }

const renderCard = (place: Place, props: Partial<Parameters<typeof PlaceCard>[0]> = {}) =>
  render(
    <ul>
      <PlaceCard place={place} saved={false} onToggleSave={() => {}} {...props} />
    </ul>,
  )

describe('commonsPhoto', () => {
  it('is set only for a credited https photo', () => {
    expect(commonsPhoto(withPhoto)).toEqual({ src: THUMB, alt: 'Alfama' })
    expect(commonsPhoto(alfama)).toBeUndefined()
    expect(commonsPhoto({ ...withPhoto, image_url: 'http://x/a.jpg' })).toBeUndefined()
  })
})

describe('PhotoCredit', () => {
  it('links the credit to the Commons file page (AC18)', () => {
    render(<PhotoCredit place={withPhoto} />)
    const link = screen.getByRole('link', { name: 'Photo: Ana, CC BY 4.0' })
    expect(link).toHaveAttribute('href', PHOTO.file_url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders nothing without a photo (AC5, AC9)', () => {
    const { container } = render(<PhotoCredit place={{ ...alfama, photo: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PlaceCard photo', () => {
  it('shows the Commons photo and its credit (AC1, AC6)', () => {
    renderCard(withPhoto)
    expect(screen.getByRole('img', { name: 'Alfama' })).toHaveAttribute('src', THUMB)
    expect(screen.getByRole('link', { name: 'Photo: Ana, CC BY 4.0' })).toHaveAttribute('href', PHOTO.file_url)
  })

  it('shows the illustration and no credit without a photo (AC3)', async () => {
    const { container } = renderCard(alfama)
    expect(await screen.findByRole('button', { name: 'Save Alfama' })).toBeInTheDocument()
    expect(document.querySelector(`img[src="${THUMB}"]`)).toBeNull()
    expect(screen.queryByText(/^Photo:/)).toBeNull()
  })

  it('says the photo is unavailable when the lookup failed (AC15)', () => {
    renderCard({ ...alfama, photo_unavailable: true })
    expect(screen.getByText('Photo unavailable')).toBeVisible()
    expect(screen.queryByRole('link', { name: /^Photo:/ })).toBeNull()
  })

  it('shows only the credit, no image, when showPhoto is off (AC7, AC8)', () => {
    const { container } = renderCard(withPhoto, { showPhoto: false })
    expect(document.querySelector(`img[src="${THUMB}"]`)).toBeNull()
    expect(screen.getByText('Photo: Ana, CC BY 4.0')).toBeInTheDocument()
  })
})

describe('pages', () => {
  it('destination results show the photo and credit (AC6)', async () => {
    stubApi({
      'GET /places?destination=Lisbon': { status: 200, body: [withPhoto] },
      'GET /trips': { status: 200, body: [] },
    })
    renderAt('/destinations?q=Lisbon&view=list')
    expect(await screen.findByRole('link', { name: 'Photo: Ana, CC BY 4.0' })).toHaveAttribute('href', PHOTO.file_url)
    expect(document.querySelector(`img[src="${THUMB}"]`)).not.toBeNull()
  })

  it('Saved shows the credit but no photo (AC7, AC8)', async () => {
    stubApi({ 'GET /saved-places': { status: 200, body: [{ ...withPhoto, image_url: THUMB }] } })
    renderAt('/saved')
    expect(await screen.findByText('Photo: Ana, CC BY 4.0')).toBeInTheDocument()
    expect(document.querySelector(`img[src="${THUMB}"]`)).toBeNull()
  })

  it('Saved shows no credit for a place without a photo (AC9)', async () => {
    stubApi({ 'GET /saved-places': { status: 200, body: [alfama] } })
    renderAt('/saved')
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
    expect(screen.queryByText(/^Photo:/)).toBeNull()
  })
})
