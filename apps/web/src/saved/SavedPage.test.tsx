import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const alfama = {
  id: 'p1',
  name: 'Alfama',
  image_url: '/a.jpg',
  place_type: 'landmark',
  price: 'free',
  lat: 38.711,
  lng: -9.13,
}
const belem = {
  id: 'p2',
  name: 'Belém Tower',
  image_url: '/b.jpg',
  place_type: 'museum',
  price: 'budget',
  lat: 38.6916,
  lng: -9.216,
}
const two = { 'GET /saved-places': { status: 200, body: [alfama, belem] } }

describe('Saved page', () => {
  it('the Saved link opens the list of saved places (AC3)', async () => {
    stubApi({ ...two, 'GET /trips': { status: 200, body: [] } })
    renderAt('/')
    fireEvent.click(await screen.findByRole('link', { name: 'Saved' }))
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
    expect(screen.getByText('2 saved places across all your trips')).toBeInTheDocument()
  })

  it('the Map tab shows all saved places (AC6)', async () => {
    stubApi(two)
    renderAt('/saved')
    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
    const map = await screen.findByRole('img', { name: 'Map of saved places' })
    expect(within(map).getAllByRole('listitem')).toHaveLength(2)
  })

  it('the Map tab shows OSM tiles when tiles are on (AC1)', async () => {
    stubApi({ ...two, 'GET /startup-status': { status: 200, body: { map_tiles: true } } })
    renderAt('/saved?view=map')
    expect((await screen.findAllByTestId('map-tile')).length).toBeGreaterThan(0)
  })

  it('the List tab shows all saved places (AC7)', async () => {
    stubApi(two)
    renderAt('/saved?view=map')
    fireEvent.click(await screen.findByRole('tab', { name: 'List' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('img', { name: 'Map of saved places' })).not.toBeInTheDocument()
  })

  it('says nothing is saved (AC8) and prompts to save from results (AC9)', async () => {
    stubApi({ 'GET /saved-places': { status: 200, body: [] } })
    renderAt('/saved')
    expect(await screen.findByText('No places are saved yet')).toBeInTheDocument()
    expect(
      screen.getByText('Save places from Destination results to see them here.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find places' })).toHaveAttribute('href', '/')
  })

  it('unsaving removes the place and offers Undo (AC10)', async () => {
    stubApi({
      'GET /saved-places': { status: 200, body: [alfama, belem] },
      'DELETE /saved-places/p1': { status: 204 },
      'PUT /saved-places/p1': { status: 200, body: alfama },
    })
    renderAt('/saved')
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Unsave Alfama' })).not.toBeInTheDocument(),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
  })

  it('lists each place on the same gradient card as Explore (AC9)', async () => {
    stubApi(two)
    renderAt('/saved')
    expect(await screen.findAllByTestId('place-cover')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to trip$/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })

  it('removing the last place shows the empty state', async () => {
    stubApi({
      'GET /saved-places': { status: 200, body: [alfama] },
      'DELETE /saved-places/p1': { status: 204 },
    })
    renderAt('/saved')
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    expect(await screen.findByText('No places are saved yet')).toBeInTheDocument()
  })

  it('rolls back and alerts when unsaving fails', async () => {
    stubApi({
      'GET /saved-places': { status: 200, body: [alfama] },
      'DELETE /saved-places/p1': { status: 500 },
    })
    renderAt('/saved')
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't update your saved places")
    expect(screen.getByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})
