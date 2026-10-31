import { render, screen } from '@testing-library/react'
import { WelcomeHeader } from './WelcomeHeader'

describe('WelcomeHeader', () => {
  it('greets by the injected clock (AC1, AC8)', () => {
    render(<WelcomeHeader subtitle="Your trips" now={new Date(2027, 0, 5, 20, 0)} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Good evening' })).toBeInTheDocument()
    expect(screen.getByText('Your trips')).toBeInTheDocument()
  })

  it('says good morning in the morning', () => {
    render(<WelcomeHeader subtitle="Your trips" now={new Date(2027, 0, 5, 9, 0)} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Good morning' })).toBeInTheDocument()
  })
})
