import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('bundle baseline', () => {
  it('records main and largest route sizes from the unchanged tree', () => {
    const baseline = JSON.parse(readFileSync(resolve(__dirname, '../bundle-baseline.json'), 'utf8'))
    expect(baseline.main.bytes).toBeGreaterThan(0)
    expect(baseline.main.gzipBytes).toBeGreaterThan(0)
    expect(baseline.largestRoute.bytes).toBeGreaterThan(0)
    expect(baseline.commit).toMatch(/^[0-9a-f]{7,40}$/)
  })

  it('has a bundle:measure script', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
    expect(pkg.scripts['bundle:measure']).toBeTruthy()
  })
})
