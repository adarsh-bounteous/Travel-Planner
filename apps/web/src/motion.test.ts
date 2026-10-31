import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTION, prefersReducedMotion } from './motion'

const tokens = readFileSync(resolve(__dirname, '../../../design-system/tokens.css'), 'utf8')
const tokensJson = readFileSync(resolve(__dirname, '../../../design-system/tokens.json'), 'utf8')

describe('motion tokens', () => {
  it('exposes duration and easing lookups as var() references', () => {
    expect(MOTION.durationFast).toBe('var(--motion-duration-fast)')
    expect(MOTION.durationBase).toBe('var(--motion-duration-base)')
    expect(MOTION.durationSlow).toBe('var(--motion-duration-slow)')
    expect(MOTION.easeOut).toBe('var(--motion-ease-out)')
    expect(MOTION.easeInOut).toBe('var(--motion-ease-in-out)')
  })

  it('defines each token with a real value', () => {
    expect(tokens).toMatch(/--motion-duration-fast:\s*150ms/)
    expect(tokens).toMatch(/--motion-duration-base:\s*220ms/)
    expect(tokens).toMatch(/--motion-duration-slow:\s*400ms/)
    expect(tokens).toMatch(/--motion-ease-out:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
    expect(tokens).toMatch(/--motion-ease-in-out:\s*cubic-bezier\(0\.65, 0, 0\.35, 1\)/)
    expect(tokens).toMatch(/--motion-distance:\s*24px/)
    expect(tokens).toMatch(/--blur-placeholder:\s*12px/)
    expect(tokens).not.toMatch(/--motion[^;]*\[object Object\]/)
    expect(tokensJson).toContain('"motion-duration-base"')
  })
})

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is true when the reduce media query matches', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    expect(prefersReducedMotion()).toBe(true)
  })

  it('is false when it does not match', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(prefersReducedMotion()).toBe(false)
  })
})
