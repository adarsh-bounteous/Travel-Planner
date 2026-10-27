import { openProviderSite } from './providerSite'

afterEach(() => vi.restoreAllMocks())

describe('openProviderSite', () => {
  it('opens an https page in a new tab and reports success', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    expect(openProviderSite('https://globetrek.example/adventure-plus')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://globetrek.example/adventure-plus', '_blank')
  })

  it('reports failure when the browser blocks the new tab', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openProviderSite('https://globetrek.example/x')).toBe(false)
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'not a url', ''])('refuses %s without opening it', (url) => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    expect(openProviderSite(url)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
