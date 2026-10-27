import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from './api'
import type { Day, RestaurantPick, Trip } from './api'
import { RestaurantPickDialog } from './RestaurantPickDialog'

afterEach(() => vi.restoreAllMocks())

const days: Day[] = [
  { date: '2026-05-01', name: 'Day 1' },
  { date: '2026-05-02', name: 'Day 2' },
]
const trip: Trip = { id: 't1', name: 'Lisbon' }
const restaurant = { name: 'Casa Lima', city: 'Lisbon', typical_price: '19' as string | null, currency: 'EUR' }

const addDialog = (overrides: Partial<typeof restaurant> = {}, onDone = vi.fn()) =>
  render(
    <RestaurantPickDialog
      mode="add"
      tripId="t1"
      restaurant={{ ...restaurant, ...overrides }}
      days={days}
      travellers={2}
      onClose={() => undefined}
      onDone={onDone}
    />,
  )

describe('add mode', () => {
  it('starts Unscheduled with Meal off, and a day turns Meal on (AC2, AC3)', async () => {
    addDialog()
    expect(screen.getByRole('group', { name: 'Meal' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-05-01' } })
    expect(screen.getByRole('group', { name: 'Meal' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '' } })
    expect(screen.getByRole('group', { name: 'Meal' })).toBeDisabled()
  })

  it('shows the estimate and how it is worked out (AC5)', () => {
    addDialog()
    expect(screen.getByText('Estimate 38 EUR')).toBeInTheDocument()
    expect(screen.getByText(/19 EUR per person x 2 travellers/)).toBeInTheDocument()
  })

  it('says the estimate is unavailable without a price (AC9)', () => {
    addDialog({ typical_price: null })
    expect(screen.getByText('Estimate unavailable')).toBeInTheDocument()
    expect(screen.getByText(/won't count toward your trip total/)).toBeInTheDocument()
  })

  it('refuses a day without a meal and does not call the API (AC3)', async () => {
    const pick = vi.spyOn(api, 'pickRestaurant')
    addDialog()
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-05-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a meal for Day 1')
    expect(pick).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Breakfast' })).toHaveFocus()
  })

  it('adds Unscheduled with no day or meal (AC2)', async () => {
    const updated: Trip = { ...trip, restaurants: [] }
    const pick = vi.spyOn(api, 'pickRestaurant').mockResolvedValue(updated)
    const onDone = vi.fn()
    addDialog({}, onDone)
    fireEvent.click(screen.getByRole('button', { name: 'Add to trip' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(pick).toHaveBeenCalledWith('t1', { name: 'Casa Lima', city: 'Lisbon', date: null, meal: null })
    expect(onDone).toHaveBeenCalledWith(updated, 'Casa Lima added to Unscheduled')
  })

  it('adds on a day and meal (AC3)', async () => {
    const pick = vi.spyOn(api, 'pickRestaurant').mockResolvedValue(trip)
    const onDone = vi.fn()
    addDialog({}, onDone)
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-05-01' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Lunch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to trip' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(pick).toHaveBeenCalledWith('t1', { name: 'Casa Lima', city: 'Lisbon', date: '2026-05-01', meal: 'lunch' })
    expect(onDone).toHaveBeenCalledWith(trip, 'Casa Lima added to Day 1, lunch')
  })

  it('shows an alert when the request fails', async () => {
    vi.spyOn(api, 'pickRestaurant').mockRejectedValue(new Error('boom'))
    addDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Add to trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't add that restaurant. Try again.")
  })
})

describe('move mode', () => {
  const current: RestaurantPick = {
    id: 'p1',
    name: 'Casa Lima',
    city: 'Lisbon',
    cuisine: 'Portuguese',
    typical_price: '19',
    currency: 'EUR',
    url: null,
    date: '2026-05-01',
    meal: 'lunch',
  }

  it('preselects the current day and meal and moves to another day (AC4)', async () => {
    const move = vi.spyOn(api, 'moveRestaurant').mockResolvedValue(trip)
    const onDone = vi.fn()
    render(
      <RestaurantPickDialog mode="move" tripId="t1" pick={current} days={days} travellers={2} onClose={() => undefined} onDone={onDone} />,
    )
    expect(screen.getByLabelText('Day')).toHaveValue('2026-05-01')
    expect(screen.getByRole('radio', { name: 'Lunch' })).toBeChecked()
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-05-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(move).toHaveBeenCalledWith('t1', 'p1', { date: '2026-05-02', meal: 'lunch' })
    expect(onDone).toHaveBeenCalledWith(trip, 'Casa Lima moved to Day 2')
  })

  it('clears the meal when moved to Unscheduled', async () => {
    const move = vi.spyOn(api, 'moveRestaurant').mockResolvedValue(trip)
    render(
      <RestaurantPickDialog mode="move" tripId="t1" pick={current} days={days} travellers={2} onClose={() => undefined} onDone={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(move).toHaveBeenCalled())
    expect(move).toHaveBeenCalledWith('t1', 'p1', { date: null, meal: null })
  })
})
