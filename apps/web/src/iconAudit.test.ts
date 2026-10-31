import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const root = __dirname
const files = walk(root)
  .filter((f) => f.endsWith('.tsx') && !/\.test\.tsx$/.test(f))
  .map((f) => relative(root, f))
const src = (f: string) => readFileSync(join(root, f), 'utf8')

// Inline svg is allowed only in the icon set itself and the map, whose markers are content, not UI icons.
const ALLOWED_SVG = ['auth/icons.tsx', 'places/PlacesMap.tsx']

describe('icon audit', () => {
  it('draws svg only in the one icon set (or content allow-list)', () => {
    expect(files.filter((f) => /<svg/.test(src(f)) && !ALLOWED_SVG.includes(f))).toEqual([])
  })

  it('uses no glyph characters as icons', () => {
    expect(files.filter((f) => /[×✓✕★♥→←›▾]/.test(src(f)))).toEqual([])
  })

  // Opening-tag position to the matching closing tag; the element must hold a set icon between them.
  function bareElements(opening: RegExp, closing: RegExp): string[] {
    const bare: string[] = []
    for (const f of files) {
      const text = src(f)
      for (const match of text.matchAll(opening)) {
        const rest = text.slice(match.index)
        const end = rest.search(closing)
        const body = end === -1 ? rest : rest.slice(0, end)
        if (!/<\w*Icon\b|<Icon\b|Icon\s*\/>|\{\w*[iI]con\}/.test(body)) {
          bare.push(`${f}:${text.slice(0, match.index).split('\n').length}`)
        }
      }
    }
    return bare
  }

  it('gives every section title (h2, h3) an icon', () => {
    // A title may also sit right beside its icon in a `.modal-title` wrapper.
    const bare = bareElements(/(?<!<\w*Icon \/>\s*)<h[23][ >]/g, /<\/h[23]>/)
    expect(bare).toEqual([])
  })

  it('gives every button and button link an icon', () => {
    expect(bareElements(/<(?:button|Link|NavLink|a)\b(?:[^>]|=>)*?className=(?:"|\{`)btn\b/g, /<\/(?:button|Link|NavLink|a)>/)).toEqual([])
  })

  it('gives every meta row an icon', () => {
    expect(bareElements(/<(?:dl|p|div|span)\b[^>]*className="[^"]*-meta\b/g, /<\/(?:dl|p|div|span)>/)).toEqual([])
  })

  it('gives every empty state a leading icon', () => {
    const bare: string[] = []
    for (const f of files) {
      const lines = src(f).split('\n')
      lines.forEach((line, i) => {
        if (!/className="empty-state"/.test(line)) return
        const next = lines.slice(i, i + 4).join('\n')
        if (!/<\w*Icon\b/.test(next)) bare.push(`${f}:${i + 1}`)
      })
    }
    expect(bare).toEqual([])
  })
})
