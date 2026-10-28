import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { stubApi } from '../test-api'
import type { Stay, Trip } from './api'
import { StaysReviewDrawer } from './StaysReviewDrawer'

afterEach(() => vi.unstubAllGlobals())

const outside: Stay = { id: 's1', place: 'Lisbon', start_date: '2027-01-02', end_date: '2027-01-04', outside_trip: true }
const inside: Stay = { id: 's2', place: 'Porto', start_date: '2027-01-09', end_date: '2027-01-11' }
const trip = { id: 't1', name: 'Iberia', start_date: '2027-01-08', end_date: '2027-01-12', stays: [outside, inside] } as Trip

const setup = (onSaved = vi.fn(), onClose = vi.fn()) => {
  render(<StaysReviewDrawer trip={trip} onSaved={onSaved} onClose={onClose} />)
  return { onSaved, onClose }
}

describe('StaysReviewDrawer', () => {
  it('offers Keep dates and Adjust dates on flagged stays and says inside for the rest', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Stays after date change' })).toBeInTheDocument()
    expect(screen.getByText('Entirely outside your trip.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep dates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust dates' })).toBeInTheDocument()
    expect(screen.getByText('Inside your trip.')).toBeInTheDocument()
  })

  it('shows a note when the dates are kept', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep dates' }))
    expect(screen.getByText('Dates kept. This stay stays marked Outside trip.')).toBeInTheDocument()
  })

  it('applies adjusted dates through the change-stay route', async () => {
    const updated = { ...trip, stays: [{ ...outside, start_date: '2027-01-09', end_date: '2027-01-10', outside_trip: false }, inside] }
    const fetchMock = stubApi({ 'PUT /trips/t1/stays/s1': { status: 200, body: updated } })
    const { onSaved } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Adjust dates' }))
    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '2027-01-09' } })
    fireEvent.change(screen.getByLabelText('Check-out'), { target: { value: '2027-01-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')!
    expect(JSON.parse(init!.body as string)).toEqual({ place: 'Lisbon', start_date: '2027-01-09', end_date: '2027-01-10' })
  })

  it('refuses a check-out before check-in', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Adjust dates' }))
    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '2027-01-10' } })
    fireEvent.change(screen.getByLabelText('Check-out'), { target: { value: '2027-01-09' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }))
    expect(screen.getByText('Check-out must be on or after check-in.')).toBeInTheDocument()
  })

  it('closes on Done', () => {
    const { onClose } = setup()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})
