import { render, screen } from '@testing-library/react'
import { BrandLogo } from './BrandLogo'

describe('BrandLogo', () => {
  it('shows the mark and the wordmark together (AC3)', () => {
    render(<BrandLogo />)
    const logo = screen.getByRole('img', { name: 'Travel Planner' })
    expect(logo.querySelector('svg.brand-mark')).not.toBeNull()
    expect(logo).toHaveTextContent('Travel Planner')
  })

  it('applies size and inverse variants', () => {
    render(<BrandLogo size="lg" inverse />)
    const logo = screen.getByRole('img', { name: 'Travel Planner' })
    expect(logo).toHaveClass('brand-logo-lg', 'brand-logo-inv')
  })
})
