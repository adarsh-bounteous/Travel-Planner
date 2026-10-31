import { render, screen } from '@testing-library/react'
import { FallbackNotice } from './FallbackNotice'

const TEXT = 'Live data unavailable, showing saved data'

describe('FallbackNotice', () => {
  it('shows the notice for a fallback source (AC1)', () => {
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByText(TEXT)).toBeInTheDocument()
  })

  it('shows nothing for a live source (AC2)', () => {
    render(<FallbackNotice source="live" />)
    expect(screen.queryByText(TEXT)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses the alert style (AC3)', () => {
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByRole('status')).toHaveClass('alert')
  })

  it('is announced as a status message (AC5)', () => {
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByRole('status')).toHaveTextContent(TEXT)
  })
})
