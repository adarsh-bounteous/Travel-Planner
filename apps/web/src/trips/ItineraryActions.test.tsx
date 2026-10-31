import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import * as api from './api'
import { ItineraryActions } from './ItineraryActions'

afterEach(() => vi.restoreAllMocks())

const mockEmail = () => vi.spyOn(api, 'emailItinerary')

const show = (props: Partial<Parameters<typeof ItineraryActions>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ItineraryActions tripId="t1" email="maya@example.com" {...props} />
    </MemoryRouter>,
  )

describe('itinerary actions', () => {
  it('shows the three actions in one labelled group (AC1, AC2, AC3)', () => {
    show()
    const group = screen.getByRole('group', { name: 'Itinerary actions' })
    expect(within(group).getByRole('link', { name: 'View itinerary' })).toHaveAttribute('href', '/trips/t1/itinerary')
    expect(within(group).getByRole('link', { name: 'Print or Save as PDF' })).toHaveAttribute(
      'href',
      '/trips/t1/itinerary?print=1',
    )
    expect(within(group).getByRole('button', { name: 'Email me a copy' })).toBeInTheDocument()
    expect(screen.getByText(/arrives as HTML at maya@example.com/)).toBeInTheDocument()
  })

  it('can hide View itinerary and print in place', () => {
    const onPrint = vi.fn()
    show({ showView: false, onPrint })
    expect(screen.queryByRole('link', { name: 'View itinerary' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Print or Save as PDF' }))
    expect(onPrint).toHaveBeenCalled()
  })

  it('confirms with a toast once the copy is sent (AC4)', async () => {
    const email = mockEmail().mockResolvedValue(undefined)
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Email me a copy' }))
    expect(email).toHaveBeenCalledWith('t1')
    expect(await screen.findByText('Copy sent to maya@example.com. Check your inbox.')).toBeInTheDocument()
  })

  it('shows an alert and lets the traveller retry when the send fails (AC5)', async () => {
    mockEmail().mockRejectedValue(new Error('x'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Email me a copy' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The email could not be sent.')
    expect(alert).toHaveTextContent('Nothing arrived in your inbox. Try again in a moment.')
    expect(screen.getByRole('button', { name: 'Email me a copy' })).not.toHaveAttribute('aria-disabled')
  })

  it('ignores a second press while a copy is being sent (AC6)', async () => {
    let release!: () => void
    const email = mockEmail().mockReturnValue(new Promise<void>((r) => (release = r)))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Email me a copy' }))
    const sending = screen.getByRole('button', { name: 'Sending copy…' })
    expect(sending).toHaveAttribute('aria-disabled', 'true')
    expect(sending).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(sending)
    expect(email).toHaveBeenCalledTimes(1)
    release()
    expect(await screen.findByRole('button', { name: 'Email me a copy' })).not.toHaveAttribute('aria-disabled')
  })
})
