import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const EXPECTED_IDS = [
  'data-testid="comparison"',
  'data-testid="image-placeholder"',
  'data-testid="map-tile"',
  'data-testid="place-cover"',
  'data-testid="price-entry"',
]

describe('micro-interaction styles', () => {
  it('animates only transform and opacity (AC16)', () => {
    const frames = [...css.matchAll(/@keyframes (mi-[\w-]+)\s*\{([\s\S]*?\}\s*)\}/g)]
    expect(frames.length).toBeGreaterThanOrEqual(12)
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(props.filter((p) => !['transform', 'opacity'].includes(p)), name).toEqual([])
    }
    expect(css).not.toMatch(/\.btn\s*\{[^}]*transition:[^;]*background/)
  })

  it('gives buttons hover and press states (AC2, AC3)', () => {
    expect(css).toMatch(/\.btn:hover\s*\{[^}]*transform: translateY\(var\(--mi-hover-nudge\)\)/)
    expect(css).toMatch(/\.btn:active\s*\{[^}]*transform: scale\(var\(--mi-press\)\)/)
  })

  it('lifts a hovered card and returns it on leave (AC4, AC5)', () => {
    expect(css).toMatch(/\.lift:hover\s*\{[^}]*transform: translateY\(var\(--mi-lift\)\)/)
    expect(css).toMatch(/\.lift\s*\{[^}]*transition: transform/)
  })

  it('shimmers skeletons and draws the route line (AC10, AC15)', () => {
    expect(css).toMatch(/\.skeleton::after\s*\{[^}]*animation: mi-shimmer/)
    expect(css).toMatch(/@keyframes mi-shimmer[\s\S]*translateX\(var\(--mi-shimmer-from\)\)/)
    expect(css).toMatch(/\.route\.is-playing \.route-line\s*\{[^}]*animation: mi-line/)
  })

  it('keeps the focus ring unchanged on hover and press (AC17)', () => {
    const ring =
      'outline: var(--border-width-strong) solid var(--color-focus); outline-offset: var(--border-width-strong)'
    expect(css).toMatch(new RegExp(`\\.btn:focus-visible:hover[^{]*\\{[^}]*${escape(ring)}`))
    expect(css).toMatch(new RegExp(`\\.btn:focus-visible:active[^{]*\\{[^}]*${escape(ring)}`))
  })

  it('keeps every existing test id (AC18)', () => {
    const ids = execSync(`grep -rhoE 'data-testid="[^"]+"' src --include=*.tsx --exclude=*.test.tsx`, {
      cwd: resolve(__dirname, '..'),
    })
      .toString()
      .split('\n')
      .filter(Boolean)
    for (const id of EXPECTED_IDS) expect(ids).toContain(id)
  })
})
