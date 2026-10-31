import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientApiPaths } from './clientPaths'
import { apiProxy, pageRequestBypass } from './devProxy'

const srcDir = dirname(fileURLToPath(import.meta.url))

describe('devProxy', () => {
  it('proxies every path the web app fetches to the given origin', () => {
    const proxy = apiProxy('http://127.0.0.1:9100')
    for (const p of [
      '/auth',
      '/trips',
      '/places',
      '/saved-places',
      '/profile',
      '/shared',
      '/invites',
      '/transport',
      '/local',
      '/travel-search',
      '/startup-status',
      '/rates',
      '/availability',
      '/starter-destinations',
    ]) {
      expect(proxy[p].target).toBe('http://127.0.0.1:9100')
    }
  })

  it('forwards every path the web API clients call', () => {
    const found = clientApiPaths(srcDir)
    const paths = found.map(({ path }) => path)
    expect(paths).toContain('/starter-destinations')
    expect(paths).toContain('/trips')
    const proxy = apiProxy('http://x')
    const missing = found.filter(({ path }) => !(path in proxy))
    expect(missing, `client paths not forwarded by the dev server: ${JSON.stringify(missing)}`).toEqual([])
  })

  it('forwards starter destination data requests', () => {
    expect(
      pageRequestBypass({ url: '/starter-destinations', headers: { accept: '*/*' } }),
    ).toBeUndefined()
  })

  it('serves the app for page loads of client routes', () => {
    expect(pageRequestBypass({ url: '/trips/abc', headers: { accept: 'text/html,*/*' } })).toBe(
      '/index.html',
    )
  })

  it('proxies data requests', () => {
    expect(pageRequestBypass({ url: '/trips', headers: { accept: '*/*' } })).toBeUndefined()
  })

  it('proxies rate conversion data requests', () => {
    expect(
      pageRequestBypass({
        url: '/rates/convert?amount=10&from=USD&to=EUR',
        headers: { accept: '*/*' },
      }),
    ).toBeUndefined()
  })

  it('still sends auth navigations to the API', () => {
    expect(
      pageRequestBypass({ url: '/auth/google', headers: { accept: 'text/html' } }),
    ).toBeUndefined()
  })
})
