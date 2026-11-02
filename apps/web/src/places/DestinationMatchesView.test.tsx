import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const JAIPUR = { id: 'starter:India/Jaipur', name: 'Jaipur', region: 'India', kind: 'starter', fullGuide: true }
const JAIPUR_LIVE = { id: 'live:jaipur.sig', name: 'Jaipur', region: 'Rajasthan, India', kind: 'live', fullGuide: false }
const AGRA = { id: 'live:agra.sig', name: 'Agra', region: 'Uttar Pradesh, India', kind: 'live', fullGuide: false }
const reply = (matches: object[], extra: object = {}) => ({
  status: 200,
  body: { live: true, unavailable: false, matches, ...extra },
})

describe('Destination matches view', () => {
  it('lists starters first under their own heading, with Full guide on starters only (AC6, AC7, AC18)', async () => {
    stubApi({ 'GET /places/search?q=Ja': reply([AGRA, JAIPUR]) })
    renderAt('/destinations?q=Ja')
    expect(await screen.findByRole('heading', { name: 'Results for “Ja”' })).toBeInTheDocument()
    const groups = await screen.findAllByRole('heading', { level: 3, name: /Starter destinations|Live places/ })
    expect(groups.map((g) => g.textContent)).toEqual(['Starter destinations', 'Live places'])
    const rows = Array.from(document.querySelectorAll('li.result-card'))
    expect(rows[0]).toHaveTextContent('Jaipur')
    expect(rows[0]).toHaveTextContent('Full guide')
    expect(rows[1]).toHaveTextContent('Agra')
    expect(rows[1]).toHaveTextContent('Live place')
    expect(rows[1]).not.toHaveTextContent('Full guide')
  })

  it('opens New trip with the picked place filled in (AC2)', async () => {
    const profile = {
      display_name: 'Maya',
      home_city: '',
      dietary_notes: '',
      citizenship: 'Ireland',
      residence: 'Portugal',
      health_status: 'Allergies',
      religion: 'Hindu',
      diet: 'Vegan',
      tastes: ['Food'],
      travel_style: 'Relaxed',
    }
    stubApi({
      'GET /places/search?q=Agra': reply([AGRA]),
      'GET /profile': { status: 200, body: profile },
    })
    renderAt('/destinations?q=Agra')
    fireEvent.click(await screen.findByRole('button', { name: 'Start trip to Agra' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('searchbox', { name: 'Destination' })).toHaveValue('Agra, India')
  })

  it('shows a starter row as the secondary button and a live row as the primary one', async () => {
    stubApi({ 'GET /places/search?q=Jaipur': reply([JAIPUR, JAIPUR_LIVE]) })
    renderAt('/destinations?q=Jaipur')
    const buttons = await screen.findAllByRole('button', { name: /Start trip/ })
    expect(buttons[0]).toHaveClass('btn-secondary')
    expect(buttons[1]).toHaveClass('btn-primary')
  })

  it('says no places match and keeps the search box (AC9)', async () => {
    stubApi({ 'GET /places/search?q=Zzzz': reply([]) })
    renderAt('/destinations?q=Zzzz')
    const empty = await screen.findByRole('status')
    expect(within(empty).getByText('No places match')).toBeInTheDocument()
    expect(within(empty).getByText('Try another search above.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search a city or town' })).toHaveValue('Zzzz')
  })

  it('searches again from the box', async () => {
    const fetchMock = stubApi({
      'GET /places/search?q=Zzzz': reply([]),
      'GET /places/search?q=Agra': reply([AGRA]),
    })
    renderAt('/destinations?q=Zzzz')
    await screen.findByText('No places match')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search a city or town' }), {
      target: { value: 'Agra' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('heading', { name: 'Agra' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/places/search?q=Agra', expect.anything())
  })

  it('says live places are off and shows only starters (AC12, AC19)', async () => {
    stubApi({ 'GET /places/search?q=Jaipur': reply([JAIPUR], { live: false }) })
    renderAt('/destinations?q=Jaipur')
    expect(
      await screen.findByText('Live places are off. Only starter destinations are searched.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Live places')).not.toBeInTheDocument()
  })

  it('notes when live search is unavailable and still shows starters (AC20, AC21)', async () => {
    stubApi({ 'GET /places/search?q=Jaipur': reply([JAIPUR], { unavailable: true }) })
    renderAt('/destinations?q=Jaipur')
    expect(
      await screen.findByText('Live results are unavailable right now; showing starter destinations only.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jaipur' })).toBeInTheDocument()
  })
})
