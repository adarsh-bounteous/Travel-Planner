import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { destinationLabel } from './destination'
import { DestinationGate } from './DestinationGate'
import { formatDestination } from '../places/destinationMatch'
import type { DestinationRef, DestinationStatus } from './destination'

const LISBON: DestinationRef = { country: 'Portugal', place: 'Lisbon', label: 'Lisbon, Portugal' }

const show = (status: DestinationStatus, destination: DestinationRef | null = LISBON) =>
  render(
    <MemoryRouter>
      <DestinationGate tripId="t1" destination={destination} status={status}>
        <p>view content</p>
      </DestinationGate>
    </MemoryRouter>,
  )

describe('DestinationGate', () => {
  it('shows the label and the content when ready (AC5)', () => {
    show('ready')
    expect(screen.getByText('Destination: Lisbon, Portugal')).toBeInTheDocument()
    expect(screen.getByText('view content')).toBeInTheDocument()
  })

  it('prompts to choose a destination and links to the trip (AC6, AC8)', () => {
    show('no_destination', null)
    expect(screen.getByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a destination' })).toHaveAttribute('href', '/trips/t1')
    expect(screen.queryByText('view content')).not.toBeInTheDocument()
  })

  it('says there is no information for the country (AC7)', () => {
    show('no_country_data')
    expect(screen.getByText('No information available for this country')).toBeInTheDocument()
    expect(screen.queryByText('view content')).not.toBeInTheDocument()
  })

  it('says there is no information for the place (AC9)', () => {
    show('no_place_data')
    expect(screen.getByText('No information available for this place')).toBeInTheDocument()
    expect(screen.queryByText('view content')).not.toBeInTheDocument()
  })

  it('says data is limited for a live place and offers Try again (AC13, AC14)', () => {
    const onRetry = vi.fn()
    render(
      <MemoryRouter>
        <DestinationGate
          tripId="t1"
          destination={{ country: 'India', place: 'Agra', label: 'Agra, India' }}
          status="limited_data"
          feature="visa rules"
          onRetry={onRetry}
        >
          <p>view content</p>
        </DestinationGate>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Limited data for Agra, India' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'We couldn’t load visa rules for this place. Your other pages still work. Try again in a moment.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('view content')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('uses the same label as the destination picker (AC5)', () => {
    expect(destinationLabel('Portugal', 'Lisbon')).toBe('Lisbon, Portugal')
    expect(destinationLabel('Portugal', null)).toBe('Portugal')
    expect(formatDestination({ country: 'Portugal', place: 'Lisbon' })).toBe(destinationLabel('Portugal', 'Lisbon'))
  })
})
