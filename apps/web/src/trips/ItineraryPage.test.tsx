import { readFileSync } from 'node:fs'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { renderAt, stubApi } from '../test-api'
import type { Itinerary, ItineraryItem } from './api'

afterEach(() => vi.unstubAllGlobals())

const css = readFileSync('src/index.css', 'utf8')
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  return css.slice(start, css.indexOf('}', start))
}

const item = (kind: ItineraryItem['kind'], title: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  kind,
  title,
  detail: null,
  status: null,
  link_text: null,
  link_url: null,
  ...extra,
})

const cover = {
  name: 'Lisbon & Porto in November',
  start_date: '2026-11-14',
  end_date: '2026-11-16',
  destinations: ['Lisbon, Portugal'],
}
const dayDates = ['2026-11-14', '2026-11-15', '2026-11-16']

const empty: Itinerary = {
  cover,
  glance: { booked: 0, unbooked: 0 },
  days: dayDates.map((date, i) => ({ number: i + 1, date, items: [] })),
  still_to_schedule: [],
}

const planned: Itinerary = {
  cover,
  glance: { booked: 4, unbooked: 2 },
  days: [
    {
      number: 1,
      date: '2026-11-14',
      items: [
        item('stay', 'Alfama Loft', {
          status: 'booked',
          link_text: 'Booking page',
          link_url: 'https://stays.example.com/x',
        }),
        item('check_in', 'Alfama Loft', { status: 'booked' }),
        item('check_out', 'Hotel', { status: 'booked' }),
        item('transport', 'Porto to Lisbon', { status: 'booked' }),
        item('activity', 'Sunset walk', { status: 'unbooked' }),
        item('meal', 'Cervejaria', { status: 'unbooked' }),
        item('reminder', 'Collect your Lisboa Card'),
      ],
    },
    ...empty.days.slice(1),
  ],
  still_to_schedule: [item('activity', 'Tram 28')],
}

function show(body: Itinerary | null) {
  stubApi({ 'GET /trips/t1/itinerary': body ? { status: 200, body } : { status: 404 } })
  renderAt('/trips/t1/itinerary')
}

describe('ItineraryPage', () => {
  it('shows the cover, at a glance, day by day and still to schedule (AC1, AC13)', async () => {
    show(planned)
    expect(await screen.findByRole('heading', { level: 1, name: cover.name })).toBeInTheDocument()
    const coverSection = document.getElementById('cover') as HTMLElement
    expect(within(coverSection).getByText(/Lisbon, Portugal/)).toBeInTheDocument()
    expect(within(coverSection).getByText(/14/)).toBeInTheDocument()
    for (const name of ['At a glance', 'Day by day', 'Still to schedule'])
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
  })

  it('shows the logo at the top of the document (AC1)', async () => {
    show(planned)
    await screen.findByRole('heading', { level: 1, name: cover.name })
    const doc = document.querySelector('.document') as HTMLElement
    expect(within(doc).getByRole('img', { name: 'Travel Planner' })).toBeInTheDocument()
  })

  it('lists each day once and shows Not yet planned for an empty day (AC4, AC5)', async () => {
    show(planned)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Day 1',
      'Day 2',
      'Day 3',
    ])
    expect(screen.getAllByText('Not yet planned')).toHaveLength(2)
  })

  it('shows Not yet planned in every section when nothing is planned (AC7)', async () => {
    show(empty)
    await screen.findByRole('heading', { level: 1, name: cover.name })
    expect(screen.getAllByText('Not yet planned').length).toBeGreaterThanOrEqual(5)
    for (const name of ['Cover', 'At a glance', 'Day by day', 'Still to schedule'])
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
  })

  it('lists an undated item under Still to schedule (AC6)', async () => {
    show(planned)
    await screen.findByRole('heading', { level: 1 })
    const still = screen.getByRole('region', { name: 'Still to schedule' })
    expect(within(still).getByText(/Tram 28/)).toBeInTheDocument()
  })

  it('shows the booked and unbooked counts (AC14, AC15)', async () => {
    show(planned)
    expect(await screen.findByText('Booked: 4')).toBeInTheDocument()
    expect(screen.getByText('Unbooked: 2')).toBeInTheDocument()
  })

  it('lists all seven item types on a day with a link that prints its URL (AC16, AC18)', async () => {
    show(planned)
    await screen.findByRole('heading', { level: 1 })
    const day = screen.getByRole('article', { name: 'Day 1' })
    for (const label of ['Stay', 'Check-in', 'Check-out', 'Transport', 'Activity', 'Meal', 'Reminder'])
      expect(within(day).getByText(label, { selector: '.it-type' })).toBeInTheDocument()
    expect(within(day).getByRole('link', { name: 'Booking page' })).toHaveAttribute(
      'href',
      'https://stays.example.com/x',
    )
  })

  it('moves to a section and marks it current (AC8, AC9)', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    show(planned)
    await screen.findByRole('heading', { level: 1 })
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const doc = document.querySelector('.document') as HTMLElement
    expect(nav.compareDocumentPosition(doc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(doc.contains(nav)).toBe(false)
    for (const a of within(nav).getAllByRole('link'))
      expect(document.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull()
    fireEvent.click(within(nav).getByRole('link', { name: 'Day by day' }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(within(nav).getByRole('link', { name: 'Day by day' })).toHaveAttribute('aria-current', 'true')
    expect(rule('.section-list')).toMatch(/position:\s*sticky/)
  })

  it('prints through the browser and offers no money, sharing or edit actions (AC12)', async () => {
    window.print = vi.fn()
    show(planned)
    await screen.findByRole('heading', { level: 1 })
    const print = screen.getByRole('button', { name: 'Print' })
    expect(print).toHaveClass('print-fab')
    fireEvent.click(print)
    expect(window.print).toHaveBeenCalled()
    const main = document.querySelector('.itin-body') as HTMLElement
    expect(within(main).queryByRole('button', { name: /share|edit|budget|add/i })).toBeNull()
    expect(within(main).queryByRole('link', { name: /share|edit|budget|add/i })).toBeNull()
    expect(document.querySelector('.shell-header')).not.toBeNull()
  })

  it('shows only a not-found message without trip details when there is no access (AC3, AC19)', async () => {
    show(null)
    expect(await screen.findByRole('heading', { name: 'Itinerary not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your trips' })).toHaveAttribute('href', '/')
    expect(document.body.textContent).not.toMatch(/Lisbon|Nov/)
  })

  it('says what to do when the itinerary cannot load', async () => {
    stubApi({ 'GET /trips/t1/itinerary': { status: 500 } })
    renderAt('/trips/t1/itinerary')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your itinerary"))
  })
})

describe('itinerary print stylesheet', () => {
  const print = css.slice(css.indexOf('@media print'))

  it('prints on A4 (AC10)', () => {
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/)
  })

  it('hides the app navigation and the section list (AC11)', () => {
    expect(print).toMatch(/\.shell-header[^{]*\.section-list[^{]*\{[^}]*display:\s*none/)
  })

  it('starts each day on a new page (AC17)', () => {
    expect(print).toMatch(/\.day-card[^{]*\{[^}]*break-before:\s*page/)
  })

  it('follows a link with its full URL (AC18)', () => {
    expect(print).toMatch(/a\[href\]::after\s*\{[^}]*attr\(href\)/)
  })
})
