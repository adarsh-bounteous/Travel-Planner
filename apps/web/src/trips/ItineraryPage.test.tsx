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

const checklist = (done: string[]): Itinerary['checklist'] =>
  [
    ['passport', 'Passport validity'],
    ['visa', 'Visa'],
    ['insurance', 'Insurance'],
    ['sim', 'SIM'],
    ['reminders', 'Reminders'],
    ['bookings', 'Bookings to make'],
  ].map(([key, label]) => ({ key, label, hint: null, done: done.includes(key) })) as Itinerary['checklist']

const notes: Itinerary['notes'] = {
  price_notice: 'Prices and availability may change. Check again before you book.',
  confirm_notice: 'Confirm with official sources before you travel.',
  sources: [],
}

const fact = (key: string, label: string, extra: Partial<Itinerary['essentials'][number]> = {}) =>
  ({
    key,
    label,
    value: null,
    detail: null,
    link_text: null,
    link_url: null,
    source: null,
    as_of: null,
    ...extra,
  }) as Itinerary['essentials'][number]

const full = (key: string, label: string, value: string, source: string, extra = {}) =>
  fact(key, label, { value, source, as_of: '2026-10-09', ...extra })

const essentials: Itinerary['essentials'] = [
  full('visa', 'Visa status', 'A visa is required for Portugal.', 'Visa rules service', {
    link_text: 'Official visa source',
    link_url: 'https://vistos.mne.gov.pt/en',
  }),
  full('insurance', 'Insurance', 'Gold Cover', 'SafeTrip'),
  full('sim', 'SIM', 'Lisbon eSIM', 'Vodafone Portugal'),
  full('currency', 'Currency', 'EUR', 'Destination data'),
  full('weather', 'Typical weather for your dates', 'Mild days.', 'Climate data'),
  full('medical', 'Medical guidance', 'Typhoid (required)', 'Health guidance'),
]

const empty: Itinerary = {
  essentials: ['visa', 'insurance', 'sim', 'currency', 'weather'].map((k) => fact(k, k === 'sim' ? 'SIM' : k[0].toUpperCase() + k.slice(1))),
  checklist: checklist([]),
  notes,
  cover,
  glance: { booked: 0, unbooked: 0 },
  days: dayDates.map((date, i) => ({ number: i + 1, date, items: [] })),
  still_to_schedule: [],
}

const planned: Itinerary = {
  essentials,
  checklist: checklist(['visa']),
  notes: {
    ...notes,
    sources: essentials.map((f) => ({ label: f.label, source: f.source!, as_of: f.as_of! })),
  },
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

  it('lists each day once and shows Not yet planned for an empty day (AC4, AC5)', async () => {
    show(planned)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getAllByRole('article').map((a) => a.querySelector('h3')?.textContent)).toEqual([
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

describe('ItineraryPage essentials, checklist and notes', () => {
  it('shows all three sections and links to them (AC12)', async () => {
    show(planned)
    for (const name of ['Travel essentials', 'Before you go', 'Important notes'])
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Before you go' })).toHaveAttribute('href', '#before-you-go')
  })

  it('shows each fact with its source and date (AC1)', async () => {
    show(planned)
    const sim = await screen.findByTestId('fact-sim')
    expect(within(sim).getByText('Lisbon eSIM')).toBeInTheDocument()
    expect(within(sim).getByText(/Source: Vodafone Portugal\. Checked .*2026/)).toBeInTheDocument()
  })

  it('links the visa status to its official source (AC2)', async () => {
    show(planned)
    const link = await screen.findByRole('link', { name: /Official visa source/ })
    expect(link).toHaveAttribute('href', 'https://vistos.mne.gov.pt/en')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows medical guidance only when the destination has it (AC3, AC4)', async () => {
    show(planned)
    expect(await screen.findByText('Medical guidance')).toBeInTheDocument()
    expect(within(screen.getByTestId('fact-medical')).getByText(/Source:/)).toBeInTheDocument()
  })

  it('omits medical guidance when there is none (AC4)', async () => {
    show({ ...planned, essentials: essentials.filter((f) => f.key !== 'medical') })
    await screen.findByRole('heading', { name: 'Travel essentials' })
    expect(screen.queryByText('Medical guidance')).not.toBeInTheDocument()
  })

  it('lists exactly six checklist items with their done state (AC5, AC6, AC7)', async () => {
    show(planned)
    const list = await screen.findByRole('list', { name: 'Before you go' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    expect(within(screen.getByTestId('check-visa')).getByText('Done')).toBeInTheDocument()
    expect(within(screen.getByTestId('check-passport')).getByText('Not done')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /done/ })).toHaveTextContent('1 of 6 done')
  })

  it('shows Not yet planned for a fact without data (AC8)', async () => {
    show(empty)
    const insurance = await screen.findByTestId('fact-insurance')
    expect(within(insurance).getByText('Not yet planned')).toBeInTheDocument()
    expect(within(insurance).getByText('No source or date yet')).toBeInTheDocument()
  })

  it('always shows the price and official-source notices and the data sources (AC9, AC10, AC11)', async () => {
    show(planned)
    expect(await screen.findByText(/Prices and availability may change/)).toBeInTheDocument()
    expect(screen.getByText(/Confirm with official sources before you travel/)).toBeInTheDocument()
    const sources = screen.getByRole('heading', { name: 'Data sources and dates used' }).closest('div')!
    expect(within(sources).getByText(/Vodafone Portugal, .*2026/)).toBeInTheDocument()
    expect(within(sources).getAllByRole('listitem')).toHaveLength(6)
  })

  it('still renders when the new arrays are missing', async () => {
    show({ ...planned, essentials: undefined, checklist: undefined, notes: undefined } as unknown as Itinerary)
    expect(await screen.findByRole('heading', { name: 'Important notes' })).toBeInTheDocument()
    expect(screen.getByText(/Prices and availability may change/)).toBeInTheDocument()
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
