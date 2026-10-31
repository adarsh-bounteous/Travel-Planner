import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICONS } from './icons'

describe('icon set', () => {
  it.each(Object.keys(ICONS) as (keyof typeof ICONS)[])('renders %s as an inline svg', (name) => {
    const Icon = ICONS[name]
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg.icon')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden')).toBe('true')
    expect(svg!.querySelector('path,circle,rect')).not.toBeNull()
  })

  it('has the glyphs the rollout needs', () => {
    for (const name of ['compass', 'heart', 'users', 'bed', 'plane', 'wallet', 'sim', 'utensils', 'shield', 'list', 'refresh'])
      expect(Object.keys(ICONS)).toContain(name)
  })
})
