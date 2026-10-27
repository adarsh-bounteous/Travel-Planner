import { apiProxy, pageRequestBypass } from './devProxy'

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
    ]) {
      expect(proxy[p].target).toBe('http://127.0.0.1:9100')
    }
  })

  it('serves the app for page loads of client routes', () => {
    expect(pageRequestBypass({ url: '/trips/abc', headers: { accept: 'text/html,*/*' } })).toBe(
      '/index.html',
    )
  })

  it('proxies data requests', () => {
    expect(pageRequestBypass({ url: '/trips', headers: { accept: '*/*' } })).toBeUndefined()
  })

  it('still sends auth navigations to the API', () => {
    expect(
      pageRequestBypass({ url: '/auth/google', headers: { accept: 'text/html' } }),
    ).toBeUndefined()
  })
})
