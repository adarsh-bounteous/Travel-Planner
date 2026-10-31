import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICONS } from './icons'

describe('icon set', () => {
  it.each(['home', 'search', 'trips', 'profile', 'calendar', 'map-pin', 'clock', 'plus', 'arrow-right', 'close', 'suitcase'] as const)(
    'renders %s as an inline svg',
    (name) => {
      const Icon = ICONS[name]
      const { container } = render(<Icon />)
      const svg = container.querySelector('svg.icon')
      expect(svg).not.toBeNull()
      expect(svg!.getAttribute('aria-hidden')).toBe('true')
      expect(svg!.querySelector('path,circle,rect')).not.toBeNull()
    },
  )
})
