import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICONS } from './icons'
import type { IconName } from './icons'

const NAMES = [
  'home', 'search', 'trips', 'profile', 'calendar', 'map-pin', 'clock', 'plus', 'arrow-right', 'close', 'suitcase',
  'explore', 'users', 'bed', 'plane', 'wallet', 'sim', 'utensils', 'shield', 'list', 'refresh', 'user', 'heart',
] as const satisfies readonly IconName[]

describe('icon set', () => {
  it.each(NAMES)('has %s in the set', (name) => {
    expect(name in ICONS).toBe(true)
  })

  it.each(Object.keys(ICONS) as IconName[])('renders %s as an inline svg', (name) => {
    const Icon = ICONS[name]
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg.icon')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden')).toBe('true')
    expect(svg!.querySelector('path,circle,rect')).not.toBeNull()
  })
})
