import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(__dirname, '../../../docs/design/after/phase-2')
const files = ['home', 'my-trips', 'trip-planner'].flatMap((p) =>
  ['390', '1280'].flatMap((w) => ['before', 'after'].map((s) => `${p}-${s}-${w}.png`)),
)

describe('phase 2 evidence screenshots', () => {
  it('has all 12 files', () => expect(files).toHaveLength(12))

  it.each(files)('%s exists and is a PNG of the width in its name', (f) => {
    expect(statSync(resolve(dir, f)).size).toBeGreaterThan(0)
    const png = readFileSync(resolve(dir, f))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(Number(f.match(/-(\d+)\.png$/)![1]))
  })

  it.each(['bundle-report.md', 'bundle-report.json', 'lighthouse.md', 'lighthouse.json', 'README.md'])(
    '%s is committed',
    (f) => expect(statSync(resolve(dir, f)).size).toBeGreaterThan(0),
  )
})
