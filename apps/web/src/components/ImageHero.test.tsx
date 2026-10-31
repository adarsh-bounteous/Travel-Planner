import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { ImageHero } from './ImageHero'

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
const rule = (selector: string) =>
  css.match(new RegExp(`${selector.replace(/[.>]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

describe('ImageHero', () => {
  it('shows destination art 16:9 with non-empty alt text (AC2, AC9, AC11)', async () => {
    const { container } = render(
      <ImageHero illustration={{ destination: 'Lisbon' }} title={<h1>Fake trip</h1>} />,
    )
    const img = await waitFor(() => {
      const el = container.querySelector('img')
      expect(el).not.toBeNull()
      return el!
    })
    expect(img.getAttribute('src')).toMatch(/lisbon\.svg/)
    expect(img).toHaveAttribute('alt', 'Illustration of Lisbon')
    expect(img).not.toHaveAttribute('aria-hidden')
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
  })

  it('falls back to generic art with a neutral alt (AC13, AC11)', async () => {
    const { container } = render(
      <ImageHero illustration={{ destination: 'Nowhere' }} title={<h1>Fake trip</h1>} />,
    )
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toMatch(/generic\.svg/))
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Neutral illustration of hills and a sun')
  })

  it('puts the title and dates over a scrim that screen readers skip (AC7)', () => {
    const { container } = render(
      <ImageHero illustration={{}} title={<h1>Fake trip</h1>} dates="1 Jan to 3 Jan" variant="cover" />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Fake trip' })).toBeInTheDocument()
    expect(screen.getByText('1 Jan to 3 Jan')).toBeInTheDocument()
    expect(container.querySelector('.scrim')).toHaveAttribute('aria-hidden', 'true')
  })

  it('builds the scrim and text colours from tokens, text above the scrim (AC7)', () => {
    const scrim = rule('.scrim')
    expect(scrim).toContain('var(--color-overlay)')
    expect(scrim).toMatch(/z-index:\s*1\b/)
    expect(scrim).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    const text = css.match(/\.hero-title,\s*\.hero-dates\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(text).toMatch(/z-index:\s*2\b/)
    expect(text).toContain('var(--color-on-primary)')
  })
})
