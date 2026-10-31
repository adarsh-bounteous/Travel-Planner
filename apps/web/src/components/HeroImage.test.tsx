import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeroImage } from './HeroImage'

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')

describe('HeroImage', () => {
  it('puts the image first, then the scrim, then the text', async () => {
    const { container } = render(
      <HeroImage illustration={{ destination: 'Lisbon' }} alt="Illustration of Lisbon">
        <h1 className="hero-title">Lisbon</h1>
      </HeroImage>,
    )
    const hero = container.querySelector('.hero')!
    const kids = Array.from(hero.children).map((c) => c.className)
    expect(kids).toEqual(['imgc', 'scrim', 'hero-text'])
    expect(hero.querySelector('.hero-text .hero-title')).not.toBeNull()
    expect(await screen.findByRole('img', { name: 'Illustration of Lisbon' })).toBeInTheDocument()
    expect(hero.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
  })

  it('builds the scrim from tokens only', () => {
    expect(css).toMatch(/\.scrim\s*\{[^}]*var\(--color-overlay\)/)
    expect(css).not.toMatch(/\.scrim\s*\{[^}]*#[0-9a-f]{3,8}/i)
  })
})
