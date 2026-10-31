import { act, fireEvent, render, screen } from '@testing-library/react'
import { Toast } from './Toast'

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows an error toast as an alert that can be dismissed', () => {
    render(<Toast message="Boom" tone="error" dismissible />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    fireEvent.animationEnd(document.querySelector('.toast')!)
    expect(screen.queryByText('Boom')).not.toBeInTheDocument()
  })

  it('animates in and out (AC8, AC9)', () => {
    render(<Toast message="Saved" dismissible />)
    const toast = document.querySelector('.toast')!
    expect(toast).toHaveClass('is-entering')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(toast).toHaveClass('is-leaving')
    fireEvent.animationEnd(toast)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('still unmounts when no animation event fires', () => {
    vi.useFakeTimers()
    render(<Toast message="Saved" dismissible />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('shows the default tone as a status without a Dismiss button', () => {
    render(<Toast message="Saved" />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('hides after the given ms', () => {
    vi.useFakeTimers()
    render(<Toast message="Boom" tone="error" ms={6000} />)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText('Boom')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(document.querySelector('.toast')).toHaveClass('is-leaving')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText('Boom')).not.toBeInTheDocument()
  })
})
