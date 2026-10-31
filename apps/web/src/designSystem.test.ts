import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ratio } from './test/contrast'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')
const body = css.replace(/@media[^{]*\{/g, '{')
const phoneStart = css.indexOf('@media (max-width: 47.99rem) {\n  .shell-nav')
const phone = phoneStart === -1 ? '' : css.slice(phoneStart)

describe('entry screens', () => {
  it('has the sign-in split, trip card art, step and control rules', () => {
    for (const sel of ['.auth-split', '.auth-brand', '.trip-row > .imgc', '.steps', '.step.is-current']) {
      expect(css).toContain(sel)
    }
    expect(css).toMatch(/\.chip\[aria-pressed="true"\]\s*\{[^}]*var\(--color-primary-subtle\)/)
    expect(css).toMatch(/\.radio\s*\{[^}]*width: var\(--size-check\)[^}]*accent-color: var\(--color-primary\)/)
    expect(css).toMatch(/\.checkbox\s*\{[^}]*width: var\(--size-check\)[^}]*accent-color: var\(--color-primary\)/)
  })
})

describe('design system stylesheet', () => {
  it('uses tokens, not colour literals', () => {
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })

  it('uses no raw px values (1px visually-hidden boxes and 0px reduced-motion resets aside)', () => {
    const raw = body.replace(/\b[01]px\b/g, '')
    expect(raw).not.toMatch(/:\s*[^;{}]*\b\d+px\b/)
  })

  it('shows a focus ring on every control kind', () => {
    for (const sel of ['.select', '.textarea', 'button', '.shell-link', '.tab', 'input', '.toast-close', '.chip-remove']) {
      expect(css).toContain(`${sel}:focus-visible`)
    }
  })

  it('has one global reduced-motion block that keeps a fade and removes movement', () => {
    const blocks = css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? []
    expect(blocks).toHaveLength(1)
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toMatch(/--mi-lift:\s*0px/)
    expect(rm).toMatch(/--mi-press:\s*1\b/)
    expect(rm).toMatch(/--mi-shift:\s*0px/)
    expect(rm).toMatch(/--mi-pop-peak:\s*1\b/)
    expect(rm).toMatch(/--mi-drawer-from:\s*0%/)
    expect(rm).toMatch(/--mi-modal-from:\s*1\b/)
    expect(rm).toMatch(/--mi-check-from:\s*1\b/)
    expect(rm).toMatch(/animation-iteration-count: 1 !important/)
    expect(rm).toMatch(/\.motion-move[^}]*transform: none !important/)
    expect(rm).toMatch(/transition-property: opacity/)
    expect(rm).not.toMatch(/transition: none/)
  })

  it('uses no icon font, icon package or external icon request', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ')
    expect(deps).not.toMatch(/fontawesome|material-icons|bootstrap-icons|lucide|feather/i)
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
    expect(html).not.toMatch(/<link[^>]+(icon|font)/i)
  })

  it('turns the phone header into a horizontally scrolling pill row', () => {
    expect(phone).toMatch(/\.shell-nav\s*\{[^}]*overflow-x: auto/)
    expect(phone).toMatch(/\.shell-nav\s*\{[^}]*flex-wrap: nowrap/)
    expect(phone).toMatch(/\.shell-link\s*\{[^}]*flex: none/)
  })

  it('styles the shared option card and compare table, stacking compare rows on phones', () => {
    for (const sel of ['.option-card', '.option-card-head', '.option-card-title', '.option-card-badges', '.option-card-meta', '.option-card-body', '.option-card-price', '.option-card-actions', '.option-card.is-picked', '.compare-table']) {
      expect(css).toContain(`${sel} {`)
    }
    expect(phone).toMatch(/\.compare-table tr\s*\{[^}]*display: block/)
    expect(phone).toMatch(/\.compare-table td::before\s*\{[^}]*attr\(data-label\)/)
  })

  it('gives phone controls a --size-control-lg touch target', () => {
    for (const sel of ['.btn', '.input', '.select', '.shell-link', '.tab', '.chip', '.answer-link', '.back', '.toast-close', '.chip-remove']) {
      expect(phone).toContain(sel)
    }
    expect(phone).toContain('min-height: var(--size-control-lg)')
  })

  it('styles the trip hero text with the on-primary token over the overlay scrim', () => {
    expect(css).toMatch(/\.hero-title, \.hero-dates\s*\{[^}]*color: var\(--color-on-primary\)/)
    expect(css).toMatch(/\.scrim\s*\{[^}]*var\(--color-overlay\)/)
  })

  it('puts the cost summary in a right-hand column from 48rem', () => {
    expect(css).toMatch(/\.trip-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/)
    expect(css).toMatch(
      /@media \(min-width: 48rem\)\s*\{\s*\.trip-layout\s*\{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/,
    )
  })

  it('keeps the trip page from scrolling sideways', () => {
    expect(css).toMatch(/\.trip-layout > \*\s*\{[^}]*min-width: 0/)
    expect(css).toMatch(/\.trip-hero\s*\{[^}]*overflow-wrap: anywhere/)
    expect(css).toMatch(/\.tabs\s*\{[^}]*overflow-x: auto/)
    expect(css).toMatch(/\.link-list > li\s*\{[^}]*min-width: 0/)
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
    ['color-on-primary', 'color-primary'],
    ['color-on-primary', 'color-primary-hover'],
  ]
  it.each(pairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('per-trip accent theme', () => {
  it('declares the light theme and has no dark rule (AC2)', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/)
    expect(css).not.toMatch(/prefers-color-scheme/)
    expect(readFileSync(resolve(__dirname, '../index.html'), 'utf8')).toMatch(
      /<meta name="color-scheme" content="light">/,
    )
  })

  it('keeps --color-primary out of every palette rule (AC3)', () => {
    const rules = css.match(/\.(trip-page|hero-palette|hero-text|art-[a-z]+)[^{]*\{[^}]*\}/g) ?? []
    expect(rules.length).toBeGreaterThan(8)
    for (const r of rules) expect(r).not.toContain('--color-primary')
    expect(css).toMatch(/\.trip-page \.tab-indicator\s*\{[^}]*background:\s*var\(--pal-accent\)/)
  })

  it('keeps action buttons on primary and never re-scopes them (AC4)', () => {
    expect(css).toMatch(/\.btn-primary\s*\{[^}]*var\(--button-primary-background\)/)
    expect(css).not.toMatch(/\.trip-page[^{]*\.btn-primary/)
  })

  it('colours the selected tab and chip from the palette, with a non-colour cue (AC10)', () => {
    expect(css).toMatch(/\.trip-page \.tab\[aria-selected="true"\]\s*\{[^}]*var\(--pal-ink\)[^}]*var\(--pal-accent\)/)
    expect(css).toMatch(
      /\.trip-page \.chip\[aria-pressed="true"\][^{]*\{[^}]*var\(--pal-subtle\)[^}]*font-weight: var\(--font-weight-bold\)/,
    )
    const sel = css.match(/\.trip-page \.(tab|chip)\[[^{]*\{[^}]*\}/g) ?? []
    expect(sel.length).toBeGreaterThan(1)
    for (const r of sel) expect(r).not.toContain('--color-primary')
  })

  it('lays the palette hero out as text panel and art from 48rem (AC7)', () => {
    expect(css).toMatch(/\.hero-text\s*\{[^}]*background:\s*var\(--pal-hero\)[^}]*color:\s*var\(--color-bg\)/)
    expect(css).toMatch(
      /@media \(min-width: 48rem\)\s*\{\s*\.hero-palette\s*\{[^}]*grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\)/,
    )
  })
})
