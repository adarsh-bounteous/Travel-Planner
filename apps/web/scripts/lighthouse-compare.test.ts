import { describe, expect, it } from 'vitest'
import { PAGES, assertNoRegression, median, renderLighthouseReport } from './lighthouse-compare.mjs'

describe('assertNoRegression', () => {
  it('flags a performance drop', () => {
    expect(assertNoRegression({ home: { perf: 90, a11y: 100 } }, { home: { perf: 89, a11y: 100 } })).toEqual([
      'home performance 90 -> 89',
    ])
  })

  it('passes when scores hold or rise', () => {
    expect(assertNoRegression({ home: { perf: 90, a11y: 100 } }, { home: { perf: 91, a11y: 100 } })).toEqual([])
  })

  it('flags an accessibility drop', () => {
    expect(assertNoRegression({ trip: { perf: 80, a11y: 100 } }, { trip: { perf: 80, a11y: 96 } })).toEqual([
      'trip accessibility 100 -> 96',
    ])
  })
})

describe('lighthouse report', () => {
  it('takes the median of runs', () => {
    expect(median([90, 70, 80])).toBe(80)
  })

  it('names home, my-trips and trip-planner', () => {
    expect(PAGES.map((p) => p.id)).toEqual(['home', 'my-trips', 'trip-planner'])
    const scores = Object.fromEntries(PAGES.map((p) => [p.id, { perf: 90, a11y: 100 }]))
    const md = renderLighthouseReport(scores, scores)
    for (const id of ['home', 'my-trips', 'trip-planner']) expect(md).toContain(id)
  })
})
