import { describe, expect, it } from 'vitest'
import { compareBundles, renderReport, type BundleStats } from './bundle-compare.mjs'

const stats = ({ main = 1000, route = 1000, illustrations = 0 } = {}): BundleStats => ({
  main: { bytes: main, gzipBytes: main / 4 },
  largestRoute: { bytes: route, gzipBytes: route / 4 },
  illustrations: { bytes: illustrations, gzipBytes: illustrations / 2, count: 3 },
})

describe('compareBundles', () => {
  it('allows main bundle growth of exactly 10% and rejects more', () => {
    const r = compareBundles(stats({ main: 1000 }), stats({ main: 1100 }))
    expect(r.main.growthPct).toBeCloseTo(10)
    expect(r.main.withinCeiling).toBe(true)
    expect(compareBundles(stats({ main: 1000 }), stats({ main: 1101 })).main.withinCeiling).toBe(false)
  })

  it('judges the largest route independently of main', () => {
    const r = compareBundles(stats({ route: 500 }), stats({ route: 551 }))
    expect(r.largestRoute.withinCeiling).toBe(false)
    expect(r.main.withinCeiling).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('reports the illustration set as its own figure, excluded from main and route', () => {
    const r = compareBundles(stats({ main: 1000, illustrations: 4000 }), stats({ main: 1000, illustrations: 9000 }))
    expect(r.illustrations.afterBytes).toBe(9000)
    expect(r.main.afterBytes).toBe(1000)
    expect(r.largestRoute.afterBytes).toBe(1000)
    expect(renderReport(r)).toMatch(/Illustration set.*9000/)
    expect(r.ok).toBe(true)
  })
})
