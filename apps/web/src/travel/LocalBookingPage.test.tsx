import { screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const ref = 'local://booking/stay-lisbon-1?start=2027-03-12&end=2027-03-15'
const page = `/explore/travel/booking?ref=${encodeURIComponent(ref)}`

describe('local booking page', () => {
  it('shows the pretend booking sheet with Confirm switched off (AC4)', async () => {
    stubApi({
      [`GET /travel-search/booking?${new URLSearchParams({ ref })}`]: {
        status: 200,
        body: {
          option: {
            id: 'x',
            name: 'Lisbon Garden Suites',
            detail: '',
            price: '300',
            currency: 'EUR',
            unit: 'total',
            url: ref,
          },
          kind: 'stay',
          place: 'Lisbon',
          number: 1,
          start: '2027-03-12',
          end: '2027-03-15',
        },
      },
    })
    renderAt(page)
    expect(await screen.findByRole('heading', { name: 'Option 1 · Lisbon stay' })).toBeVisible()
    expect(screen.getByText('Pretend booking.')).toBeVisible()
    expect(screen.getByText('Lisbon Garden Suites')).toBeVisible()
    expect(screen.getByText('12–15 Mar 2027')).toBeVisible()
    expect(screen.getByText(ref)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
  })

  it('says the page is not available for a link that matches nothing', async () => {
    stubApi({})
    renderAt(page)
    expect(await screen.findByText('This page is not available')).toBeVisible()
  })
})
