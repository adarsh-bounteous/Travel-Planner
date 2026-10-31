import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PALETTES, paletteForDestination, paletteForTrip, paletteStyle } from './tripPalettes'

const tokens = readFileSync(resolve(__dirname, '../../../../design-system/tokens.css'), 'utf8')
const tokenHex = (n: string) => tokens.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))![1]
/** A palette value is a hex, or `var(--token)` read from tokens.css. */
const resolveHex = (v: string) => {
  const ref = v.match(/^var\(--([a-z-]+)\)$/)
  return ref ? tokenHex(ref[1]) : v
}
function lum(hex: string) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const seeded = ['lisbon', 'kyoto', 'marrakech', 'paris'] as const
const all = Object.values(PALETTES)

describe('palette lookup', () => {
  it.each(seeded)('%s has its own named palette (AC1)', (d) => {
    expect(paletteForDestination(d).name).toBe(d)
  })

  it('resolves the sample-seed destinations to non-neutral palettes (AC1)', () => {
    expect(paletteForTrip({ destination: 'Kyoto' }).name).toBe('kyoto')
    expect(paletteForTrip({ destination: 'Lisbon' }).name).toBe('lisbon')
    expect(paletteForTrip({ place: 'Lisbon', country: 'Portugal' }).name).toBe('lisbon')
    expect(paletteForTrip({ destination: 'Lisbon, Portugal' }).name).toBe('lisbon')
  })

  it('gives unmatched or missing destinations the neutral palette (AC5)', () => {
    expect(paletteForDestination('Atlantis').name).toBe('neutral')
    expect(paletteForDestination(undefined).name).toBe('neutral')
    expect(paletteForDestination('').name).toBe('neutral')
    expect(paletteForTrip({ destination: null }).name).toBe('neutral')
  })

  it('is a pure lookup: the same palette every time (AC6)', () => {
    for (let i = 0; i < 20; i++) expect(paletteForDestination('Kyoto')).toBe(PALETTES.kyoto)
    expect(paletteForDestination('  KYOTO ')).toBe(PALETTES.kyoto)
  })

  it('sets every palette value as a --pal custom property', () => {
    expect(paletteStyle(PALETTES.lisbon)).toMatchObject({
      '--pal-hero': PALETTES.lisbon.hero,
      '--pal-accent': PALETTES.lisbon.accent,
      '--pal-subtle': PALETTES.lisbon.subtle,
      '--pal-ink': PALETTES.lisbon.ink,
      '--pal-sky': PALETTES.lisbon.sky,
      '--pal-sun': PALETTES.lisbon.sun,
      '--pal-deep': PALETTES.lisbon.deep,
    })
  })
})

describe('palette set', () => {
  it('differs in colour between every palette (AC9)', () => {
    for (const key of ['hero', 'accent'] as const) {
      const values = all.map((p) => resolveHex(p[key]).toLowerCase())
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it('never uses --color-primary (AC3)', () => {
    const primary = tokenHex('color-primary').toLowerCase()
    for (const p of all) {
      for (const v of [p.hero, p.accent, p.subtle, p.ink, p.sky, p.sun, p.deep]) {
        expect(resolveHex(v).toLowerCase()).not.toBe(primary)
        expect(v).not.toContain('color-primary')
      }
    }
  })

  it.each(all)('$name hero text on the hero panel is at least 4.5:1 (AC7)', (p) => {
    expect(ratio(tokenHex('color-bg'), resolveHex(p.hero))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(all)('$name accent is at least 3:1 on white (AC8)', (p) => {
    expect(ratio(tokenHex('color-bg'), resolveHex(p.accent))).toBeGreaterThanOrEqual(3)
  })

  it.each(all)('$name ink is at least 4.5:1 on white and on subtle (AC8)', (p) => {
    expect(ratio(tokenHex('color-bg'), resolveHex(p.ink))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(resolveHex(p.subtle), resolveHex(p.ink))).toBeGreaterThanOrEqual(4.5)
  })
})
