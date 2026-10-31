import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PALETTES, type Palette } from './trips/tripPalettes'
import { composite, ratio } from './test/contrast'

const tokens = readFileSync(resolve(__dirname, '../../../design-system/tokens.css'), 'utf8')
const token = (n: string) => tokens.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))![1]

/** A palette value as a hex colour: neutral values are `var(--token)` and resolve through tokens.css. */
const resolveColour = (v: string) => {
  const name = v.match(/^var\(--([a-z-]+)\)$/)?.[1]
  return name ? token(name) : v
}

// Hero text is --color-on-primary (white) on --pal-hero or on the art's scrim (.hero-title, .hero-dates in index.css).
const heroText = token('color-on-primary')
const white = token('color-bg')
// The scrim runs 85% at the bottom edge, 55% at 40% of the height and 0% at 75% (.scrim in index.css).
// The title and dates sit in the bottom 35% of the hero, so the weakest cover under any glyph is the
// scrim's alpha 35% up, found by interpolating between the 85% and 55% stops.
const TEXT_BAND_TOP = 0.35
const SCRIM_ALPHA = 0.85 - (0.85 - 0.55) * (TEXT_BAND_TOP / 0.4)
const overlay = token('color-overlay')

const artDir = resolve(__dirname, 'illustrations/art')
const svgFills = readdirSync(artDir)
  .filter((f) => f.endsWith('.svg'))
  .flatMap((f) =>
    [...readFileSync(resolve(artDir, f), 'utf8').matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => ({
      file: f,
      fill: m[1].toLowerCase(),
    })),
  )

/** Every colour the art can put behind hero text: the destination SVG fills and the palette's own fills. */
const illustrationBackdrops = (p: Palette) =>
  [...svgFills.map((s) => s.fill), ...[p.hero, p.accent, p.sky, p.sun, p.deep].map(resolveColour)].map((fill) =>
    composite(overlay, SCRIM_ALPHA, fill),
  )

const palettes = Object.values(PALETTES)

describe('accent theme set', () => {
  it('covers the four destinations and neutral, so a new theme is tested automatically', () => {
    expect(palettes).toHaveLength(5)
    expect(palettes.map((p) => p.name).sort()).toEqual(['kyoto', 'lisbon', 'marrakech', 'neutral', 'paris'])
  })

  it('reads destination art fills', () => {
    expect(svgFills.length).toBeGreaterThan(10)
  })
})

describe.each(palettes)('$name palette text', (p) => {
  it('hero text on the hero panel is at least 4.5:1', () => {
    expect(ratio(heroText, resolveColour(p.hero))).toBeGreaterThanOrEqual(4.5)
  })

  it('ink on white and ink on the subtle tint are at least 4.5:1', () => {
    expect(ratio(resolveColour(p.ink), white)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(resolveColour(p.ink), resolveColour(p.subtle))).toBeGreaterThanOrEqual(4.5)
  })

  it('body text on the subtle tint is at least 4.5:1', () => {
    expect(ratio(token('color-fg'), resolveColour(p.subtle))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('light theme text', () => {
  it.each([
    ['color-fg', 'color-bg'],
    ['color-fg', 'color-surface'],
    ['color-fg-muted', 'color-bg'],
    ['color-fg-muted', 'color-surface'],
  ])('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
  })
})

describe.each(palettes)('$name text over illustration', (p) => {
  it('hero text over every art fill under the scrim is at least 4.5:1', () => {
    for (const bg of illustrationBackdrops(p)) expect(ratio(heroText, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
