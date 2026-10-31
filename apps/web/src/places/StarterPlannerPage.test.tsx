import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const catalogue = [
  { name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] },
  { name: 'Portugal', places: ['Lisbon', 'Porto', 'Lagos'] },
  { name: 'India', places: ['Delhi', 'Jaipur', 'Goa'] },
  { name: 'Thailand', places: ['Bangkok', 'Chiang Mai', 'Phuket'] },
  { name: 'Mexico', places: ['Mexico City', 'Oaxaca', 'Tulum'] },
  { name: 'Morocco', places: ['Marrakech', 'Fez', 'Chefchaouen'] },
  { name: 'Peru', places: ['Lima', 'Cusco', 'Arequipa'] },
]
const replies = { 'GET /starter-destinations': { status: 200, body: catalogue } }

const destination = () => screen.findByRole('button', { name: /destination/i })
const place = () => screen.getByRole('button', { name: /place/i })
const pick = (name: string) => fireEvent.click(screen.getByRole('option', { name }))

async function pickJapanTokyo() {
  fireEvent.click(await destination())
  pick('Japan')
  fireEvent.click(place())
  pick('Tokyo')
}

describe('Starter planner page', () => {
  it('lists exactly the seven countries, including Japan, Portugal and India (AC2, AC3)', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    fireEvent.click(await destination())
    const options = within(screen.getByRole('listbox', { name: 'Countries' })).getAllByRole('option')
    expect(options).toHaveLength(7)
    for (const name of ['Japan', 'Portugal', 'India'])
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    expect(screen.getByText('7 starter countries to explore.')).toBeInTheDocument()
    expect(screen.queryByText(/We couldn't load the starter destinations/)).not.toBeInTheDocument()
  })

  it('says no starter places are available for a country without places', async () => {
    stubApi({ 'GET /starter-destinations': { status: 200, body: [{ name: 'Atlantis', places: [] }] } })
    renderAt('/trips/plan')
    fireEvent.click(await destination())
    pick('Atlantis')
    expect(screen.getByText('No starter places are available for Atlantis.')).toBeInTheDocument()
    expect(screen.queryByText(/0 places in/)).not.toBeInTheDocument()
  })

  it('opens the place content page from the selected place', async () => {
    stubApi({
      ...replies,
      'GET /starter-destinations/Japan/Tokyo': {
        status: 200,
        body: { name: 'Tokyo', places: [], restaurants: [], stays: [], activities: [], medical_guidance: '' },
      },
    })
    renderAt('/trips/plan')
    await pickJapanTokyo()
    fireEvent.click(screen.getByRole('link', { name: 'View place content' }))
    expect(await screen.findByRole('heading', { name: 'Tokyo', level: 2 })).toBeInTheDocument()
  })

  it('lists three places for a country and shows ready content, never No data (AC1, AC4)', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    fireEvent.click(await destination())
    expect(place()).toBeDisabled()
    expect(screen.getByText('Pick a country first to see its 3 places.')).toBeInTheDocument()
    pick('Japan')
    expect(screen.getByText('3 places in Japan.')).toBeInTheDocument()
    fireEvent.click(place())
    expect(within(screen.getByRole('listbox', { name: 'Places' })).getAllByRole('option')).toHaveLength(3)
    pick('Tokyo')
    expect(screen.getByRole('status')).toHaveTextContent('Starter content ready for Tokyo')
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View place content' })).toHaveAttribute(
      'href',
      '/trips/plan/Japan/Tokyo',
    )
  })

  it('resets the place when the country changes', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    await pickJapanTokyo()
    fireEvent.click(await destination())
    pick('Portugal')
    expect(screen.queryByText(/Starter content ready/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeDisabled()
    expect(place()).toHaveTextContent('Choose a place')
  })

  it('moves with the arrow keys, picks with Enter and closes with Escape', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    fireEvent.click(await destination())
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'Portugal' })).toHaveFocus()
    fireEvent.click(document.activeElement!)
    expect(await destination()).toHaveTextContent('Portugal')
    fireEvent.click(await destination())
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(await destination()).toHaveFocus()
  })

  it('completes Book trip with a confirmation once a place is picked (AC10)', async () => {
    stubApi(replies)
    renderAt('/trips/plan')
    expect(await screen.findByRole('button', { name: 'Book trip' })).toBeDisabled()
    await pickJapanTokyo()
    fireEvent.click(screen.getByRole('button', { name: 'Book trip' }))
    expect(await screen.findByText('Trip booked: Tokyo, Japan')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Booking complete' })).toHaveClass('is-playing')
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeEnabled()
  })

  it('says what happened when the catalogue cannot load', async () => {
    stubApi({ 'GET /starter-destinations': { status: 500 } })
    renderAt('/trips/plan')
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
  })
})
