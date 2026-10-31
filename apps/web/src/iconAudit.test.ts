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
