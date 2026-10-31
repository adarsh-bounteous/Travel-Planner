import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OptionCard } from './OptionCard'

describe('OptionCard', () => {
  it('puts an icon in the heading and in front of the meta row', () => {
    render(<OptionCard title="Hotel Sol" meta="Lisbon, 2 nights" />)
    const card = screen.getByRole('article', { name: 'Hotel Sol' })
    expect(card.querySelector('h3 svg.icon')).not.toBeNull()
    expect(card.querySelector('.option-card-meta svg.icon')).not.toBeNull()
  })

  it('lets a caller choose the heading and meta icons', () => {
    render(<OptionCard title="Hotel Sol" meta="Lisbon" icon={<i data-testid="own-icon" />} metaIcon={<i data-testid="own-meta" />} />)
    const card = screen.getByRole('article', { name: 'Hotel Sol' })
    expect(card.querySelector('h3 [data-testid="own-icon"]')).not.toBeNull()
    expect(card.querySelector('.option-card-meta [data-testid="own-meta"]')).not.toBeNull()
  })

  it('shows the title, badges, body and actions in the shared layout', () => {
    render(
      <OptionCard
        title="Hotel Sol"
        badges={<span className="badge">Offered by 2 providers</span>}
        price="€120"
        actions={<button type="button">Pick</button>}
      />,
    )
    const card = screen.getByRole('article', { name: 'Hotel Sol' })
    expect(card).toHaveClass('option-card')
    expect(card.querySelector('.option-card-head')).not.toBeNull()
    expect(card.querySelector('.option-card-body')).not.toBeNull()
    expect(within(card).getByRole('heading', { level: 3, name: 'Hotel Sol' })).toBeInTheDocument()
    expect(within(card).getByText('Offered by 2 providers')).toBeInTheDocument()
    expect(within(card).getByText('€120')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Pick' })).toBeInTheDocument()
  })

  it('marks a picked card and prefers an explicit aria-label', () => {
    render(<OptionCard title="Hotel Sol" ariaLabel="Hotel Sol, rank 1" picked />)
    expect(screen.getByRole('article', { name: 'Hotel Sol, rank 1' })).toHaveClass('is-picked')
  })

  it('renders as a list item when asked', () => {
    const { container } = render(
      <ul>
        <OptionCard as="li" title="Bus" />
      </ul>,
    )
    expect(container.querySelectorAll('li.option-card')).toHaveLength(1)
  })
})
