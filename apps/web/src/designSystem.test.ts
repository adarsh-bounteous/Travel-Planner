import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')
const body = css.replace(/@media[^{]*\{/g, '{')
const phoneStart = css.indexOf('@media (max-width: 47.99rem) {\n  .shell-nav')
const phone = phoneStart === -1 ? '' : css.slice(phoneStart)

describe('design system stylesheet', () => {
  it('uses tokens, not colour literals', () => {
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })

  it('uses no raw px values (1px visually-hidden boxes aside)', () => {
    const raw = body.replace(/\b1px\b/g, '')
    expect(raw).not.toMatch(/:\s*[^;{}]*\b\d+px\b/)
  })

  it('shows a focus ring on every control kind', () => {
    for (const sel of ['.select', '.textarea', 'button', '.shell-link', '.tab', 'input', '.toast-close', '.chip-remove']) {
      expect(css).toContain(`${sel}:focus-visible`)
    }
  })

  it('has one global reduced-motion block that disables animation and transition', () => {
    const blocks = css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? []
    expect(blocks).toHaveLength(1)
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation: none !important[^}]*transition: none !important/,
    )
  })

  it('turns the phone header into a horizontally scrolling pill row', () => {
    expect(phone).toMatch(/\.shell-nav\s*\{[^}]*overflow-x: auto/)
    expect(phone).toMatch(/\.shell-nav\s*\{[^}]*flex-wrap: nowrap/)
    expect(phone).toMatch(/\.shell-link\s*\{[^}]*flex: none/)
  })

  it('gives phone controls a --size-control-lg touch target', () => {
    for (const sel of ['.btn', '.input', '.select', '.shell-link', '.tab', '.chip', '.answer-link', '.back', '.toast-close', '.chip-remove']) {
      expect(phone).toContain(sel)
    }
    expect(phone).toContain('min-height: var(--size-control-lg)')
  })

  it('has no third-party origins in index.html or stylesheets', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
    expect(html).not.toMatch(/https?:\/\//)
    expect(css).not.toMatch(/@font-face/)
    for (const f of readdirSync(__dirname).filter((n) => n.endsWith('.css'))) {
      expect(readFileSync(resolve(__dirname, f), 'utf8')).not.toMatch(/https?:\/\//)
    }
  })
})

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

describe('token contrast pairs', () => {
  const tokens = readFileSync(resolve(__dirname, '../../../design-system/tokens.css'), 'utf8')
  const t = (n: string) => tokens.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))![1]
  const pairs: [string, string][] = [
    ['color-fg', 'color-bg'],
    ['color-fg-muted', 'color-bg'],
    ['color-fg-muted', 'color-surface'],
    ['color-primary', 'color-primary-subtle'],
    ['color-warning', 'color-warning-subtle'],
    ['color-bg', 'color-fg'],
  ]
  it.each(pairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5)
  })
})
