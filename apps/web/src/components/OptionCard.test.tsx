import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OptionCard } from './OptionCard'

describe('OptionCard', () => {
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

  it('puts decorative 16:9 art before the heading when given an illustration (AC8, AC9, AC12)', async () => {
    const { container } = render(<OptionCard title="Cafe" illustration={{ placeType: 'food' }} />)
    expect(container.querySelector('.option-card > .imgc')).toHaveStyle({ '--ratio': '16/9' })
    expect(container.querySelector('.imgc img')).toBeNull()
    await waitFor(() => expect(container.querySelector('.imgc img')).not.toBeNull())
    expect(container.querySelector('.imgc img')).toHaveAttribute('aria-hidden', 'true')
    const kids = Array.from(container.querySelector('.option-card')!.children)
    expect(kids[0]).toHaveClass('imgc')
  })

  it('renders no art without an illustration', () => {
    const { container } = render(<OptionCard title="Hotel Sol" />)
    expect(container.querySelector('.imgc')).toBeNull()
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
