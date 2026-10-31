import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = __dirname

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })
}

const rel = (path: string) => relative(SRC, path).split('\\').join('/')
const files = walk(SRC).map((path) => ({ file: rel(path), text: readFileSync(path, 'utf8') }))

// Map pins and tiles are map content, not UI icons.
const ALLOWED_SVG = ['auth/icons.tsx', 'components/BrandLogo.tsx', 'places/PlacesMap.tsx']

// A set icon (`<PlusIcon />`), or an icon slot (`{icon}`, `{metaIcon}`) whose default is a set icon.
const HAS_ICON = /Icon\b|\{\w*[iI]con\}/

const offenders = (find: (text: string) => string[]) =>
  files.flatMap(({ file, text }) => find(text).map((hit) => `${file}: ${hit}`))

/** Every `<tag ... className="...needle...">...</tag>` element, as its opening tag plus body. */
function elements(text: string, tags: string[], needle: RegExp) {
  const found: { head: string; block: string; line: number }[] = []
  const open = new RegExp(`<(${tags.join('|')})\\b[^>]*?className=(?:"([^"]*)"|\\{\`([^\`]*)\`\\})`, 'g')
  for (const match of text.matchAll(open)) {
    if (!needle.test(match[2] ?? match[3] ?? '')) continue
    const start = match.index!
    const close = text.indexOf(`</${match[1]}>`, start)
    const end = close === -1 ? start + 400 : close
    found.push({ head: match[0], block: text.slice(start, end), line: text.slice(0, start).split('\n').length })
  }
  return found
}

describe('icon rollout', () => {
  it('has no inline <svg> outside the icon set, the logo and the map', () => {
    expect(
      files.filter(({ file, text }) => !ALLOWED_SVG.includes(file) && /<svg\b/.test(text)).map((f) => f.file),
    ).toEqual([])
  })

  it('uses no glyph characters as icons', () => {
    expect(
      offenders((text) =>
        text.split('\n').flatMap((line, i) => (/[×✓✕✗★☆♥→←›▾✔]/.test(line) ? [`line ${i + 1}`] : [])),
      ),
    ).toEqual([])
  })

  it('gives every empty state an icon', () => {
    expect(
      offenders((text) =>
        elements(text, ['div', 'section', 'p'], /\bempty-state\b/)
          .filter(({ block }) => !/Icon\b/.test(block))
          .map(({ line }) => `line ${line}`),
      ),
    ).toEqual([])
  })

  it('gives every text button and button link an icon', () => {
    expect(
      offenders((text) =>
        elements(text, ['button', 'Link', 'NavLink', 'a'], /(^|\s)btn(\s|$|-(primary|secondary|ghost|danger))/)
          .filter(({ block }) => !/Icon\b/.test(block))
          .map(({ line }) => `line ${line}`),
      ),
    ).toEqual([])
  })

  it('gives every meta row an icon', () => {
    expect(
      offenders((text) =>
        elements(text, ['div', 'p', 'span', 'dl', 'ul'], /-meta\b/)
          .filter(({ block }) => !/Icon\b/.test(block))
          .map(({ line }) => `line ${line}`),
      ),
    ).toEqual([])
  })

  // Two kinds of heading are exempt, each for a stated reason:
  // - a dialog or drawer title (`id="…-title"` in a file that renders an Overlay) names the dialog, not a
  //   section of a screen;
  // - a heading directly under an `empty-state` icon already has that icon above it.
  // Every other h2/h3 is a section title and needs an icon.
  it('gives every section title an icon', () => {
    expect(
      offenders((text) =>
        [...text.matchAll(/<(h2|h3)\b[^>]*>/g)].flatMap((m) => {
          if (/<Overlay\b/.test(text) && /id=["{`][^>]*-title\b/.test(m[0])) return []
          const before = text.slice(Math.max(0, m.index! - 250), m.index!)
          if (/empty-state/.test(before) && /Icon\b/.test(before)) return []
          const close = text.indexOf(`</${m[1]}>`, m.index!)
          const block = text.slice(m.index!, close === -1 ? m.index! + 400 : close)
          return HAS_ICON.test(block) ? [] : [`line ${text.slice(0, m.index!).split('\n').length}`]
        }),
      ),
    ).toEqual([])
  })
})
