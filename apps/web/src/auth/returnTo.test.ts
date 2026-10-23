import { pageLabel, peekReturnTo, rememberReturnTo, safeReturnPath, takeReturnTo } from './returnTo'

afterEach(() => sessionStorage.clear())

describe('safeReturnPath', () => {
  it('accepts same-origin absolute paths', () => {
    expect(safeReturnPath('/trips?x=1')).toBe('/trips?x=1')
    expect(safeReturnPath('/')).toBe('/')
  })

  it.each([
    null,
    '',
    'trips',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/sign-in',
    '/sign-up?x=1',
    '/confirm-email',
  ])('rejects %s', (raw) => {
    expect(safeReturnPath(raw)).toBeNull()
  })
})

describe('return path storage', () => {
  it('remembers, peeks and takes once', () => {
    rememberReturnTo('/trips')
    expect(peekReturnTo()).toBe('/trips')
    expect(takeReturnTo()).toBe('/trips')
    expect(peekReturnTo()).toBeNull()
  })

  it('ignores unsafe paths', () => {
    rememberReturnTo('//evil.example')
    expect(peekReturnTo()).toBeNull()
  })

  it('does not trust a tampered stored value', () => {
    sessionStorage.setItem('returnTo', '//evil.example')
    expect(takeReturnTo()).toBeNull()
  })
})

describe('pageLabel', () => {
  it('names known pages and falls back', () => {
    expect(pageLabel('/')).toBe('Trips')
    expect(pageLabel('/somewhere')).toBe('that page')
  })
})
