import { act, renderHook } from '@testing-library/react'
import { useDestinationSearch } from './useDestinationSearch'

const reply = { live: true, unavailable: false, matches: [] }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(reply))),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useDestinationSearch', () => {
  it('stays idle under two characters', () => {
    const { result } = renderHook(() => useDestinationSearch('A'))
    act(() => vi.advanceTimersByTime(1000))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('sends one request for typing within 300 ms', async () => {
    const { rerender } = renderHook(({ q }) => useDestinationSearch(q), {
      initialProps: { q: 'Ag' },
    })
    rerender({ q: 'Agr' })
    rerender({ q: 'Agra' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/places/search?q=Agra')
  })

  it('aborts the request a newer query replaces', async () => {
    const { rerender } = renderHook(({ q }) => useDestinationSearch(q), {
      initialProps: { q: 'Ag' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const signal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal as AbortSignal
    rerender({ q: 'Agra' })
    expect(signal.aborted).toBe(true)
  })

  it('reports done with the result, and failed when the request throws', async () => {
    const { result, rerender } = renderHook(({ q }) => useDestinationSearch(q), {
      initialProps: { q: 'Agra' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current).toEqual({ status: 'done', result: reply })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    rerender({ q: 'Delhi' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current.status).toBe('failed')
  })
})
