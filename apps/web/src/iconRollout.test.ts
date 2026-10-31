import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) =>
    statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)],
  )

const files = walk(__dirname)
  .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
  .map((f) => ({ name: relative(__dirname, f), text: readFileSync(f, 'utf8') }))

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

/** Every `<tag ...>...</tag>` block whose opening tag text matches `needle`. */
const elements = (text: string, tags: string[], needle: RegExp) => {
  const found: { index: number; block: string }[] = []
  for (const tag of tags) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'g')
    for (const m of text.matchAll(open)) {
      if (!needle.test(m[0])) continue
      const end = text.indexOf(`</${tag}>`, m.index)
      found.push({ index: m.index, block: text.slice(m.index, end < 0 ? undefined : end) })
    }
  }
  return found
}

const offenders = (match: (f: (typeof files)[number]) => { index: number }[]) =>
  files.flatMap((f) => match(f).map((o) => `${f.name}: line ${lineOf(f.text, o.index)}`))

const HAS_ICON = /Icon\b|\{\w*[iI]con\}/

describe('icon rollout', () => {
  it('draws svg only in the icon set, the brand logo and the map', () => {
    const allowed = ['auth/icons.tsx', 'components/BrandLogo.tsx', 'components/ImageFrame.tsx', 'places/PlacesMap.tsx']
    const bad = files
      .filter((f) => !allowed.includes(f.name) && f.text.includes('<svg'))
      .map((f) => f.name)
    expect(bad).toEqual([])
  })

  it('uses no icon package and no text glyph as an icon', () => {
    const bad = files
      .filter((f) => /from ['"](lucide|react-icons|@heroicons|@fortawesome|@mui\/icons)/.test(f.text))
      .map((f) => f.name)
    expect(bad).toEqual([])
    expect(offenders((f) => [...f.text.matchAll(/>\s*[×✓✕✗★☆♥→←›▾✔]|[×✓✕✗★☆♥→←›▾✔]\s*</g)].map((m) => ({ index: m.index })))).toEqual([])
  })

  it('shows an icon in every empty state', () => {
    expect(
      offenders((f) => elements(f.text, ['div', 'section'], /empty-state/).filter((e) => !/Icon\b/.test(e.block))),
    ).toEqual([])
  })

  it('shows an icon in every button and link styled as a button', () => {
    expect(
      offenders((f) =>
        elements(f.text, ['button', 'Link', 'NavLink', 'a'], /\b(btn|shell-link)\b(?!-icon)/).filter((e) => !/Icon\b/.test(e.block)),
      ),
    ).toEqual([])
  })

  it('shows an icon in every meta row', () => {
    expect(
      offenders((f) => elements(f.text, ['p', 'div', 'span', 'dl'], /className="[^"]*-meta\b/).filter((e) => !/Icon\b/.test(e.block))),
    ).toEqual([])
  })

  it('shows an icon in every section title', () => {
    expect(
      offenders((f) =>
        elements(f.text, ['h2', 'h3'], /./).filter((e) => {
          if (HAS_ICON.test(e.block)) return false
          // A heading inside an empty state that already shows its icon would show two icons.
          return !elements(f.text, ['div', 'section'], /empty-state/).some(
            (s) => s.index < e.index && e.index < s.index + s.block.length && /Icon\b/.test(s.block),
          )
        }),
      ),
    ).toEqual([])
  })
})
