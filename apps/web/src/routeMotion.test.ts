import { afterEach, describe, expect, it } from 'vitest'
import { ROUTE_DURATION_MS, routeDirection, supportsViewTransitions } from './routeMotion'

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).startViewTransition
})

describe('routeMotion', () => {
  it('lasts 250 ms (AC5)', () => {
    expect(ROUTE_DURATION_MS).toBe(250)
  })

  it('slides forward on a push and back on a pop', () => {
    expect(routeDirection('PUSH')).toBe(1)
    expect(routeDirection('REPLACE')).toBe(1)
    expect(routeDirection('POP')).toBe(-1)
  })

  it('detects View Transitions support (AC1, AC2)', () => {
    expect(supportsViewTransitions()).toBe(false)
    ;(document as unknown as Record<string, unknown>).startViewTransition = () => ({})
    expect(supportsViewTransitions()).toBe(true)
  })
})
