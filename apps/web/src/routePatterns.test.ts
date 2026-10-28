import { readFileSync } from 'node:fs'
import { APP_ROUTE_PATTERNS, isKnownAppPath } from './routePatterns'

describe('routePatterns', () => {
  it('knows the app routes and rejects others (AC5)', () => {
    expect(isKnownAppPath('/')).toBe(true)
    expect(isKnownAppPath('/trips/plan/japan/kyoto')).toBe(true)
    expect(isKnownAppPath('/trips/summer-2027/hotels')).toBe(false)
  })

  it('lists every route declared in App.tsx (AC5)', () => {
    const source = readFileSync('src/App.tsx', 'utf8')
    const paths = [...source.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
    expect([...paths].sort()).toEqual([...APP_ROUTE_PATTERNS].sort())
  })
})
