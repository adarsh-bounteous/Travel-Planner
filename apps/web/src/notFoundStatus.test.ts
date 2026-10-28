import type { IncomingMessage, ServerResponse } from 'node:http'
import { notFoundStatusMiddleware } from './notFoundStatus'

const ANY_TYPE = ['*', '*'].join('/')

async function run(url: string, accept: string, method = 'GET') {
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() }
  const next = vi.fn()
  const mw = notFoundStatusMiddleware(async () => '<html>app</html>')
  mw(
    { method, url, headers: { accept } } as IncomingMessage,
    res as unknown as ServerResponse,
    next,
  )
  await vi.waitFor(() => expect(res.end.mock.calls.length + next.mock.calls.length).toBe(1))
  return { res, next }
}

describe('notFoundStatusMiddleware', () => {
  it('answers 404 with the app for an unknown page load (AC5)', async () => {
    const { res, next } = await run('/no/such/page?x=1', 'text/html')
    expect(res.statusCode).toBe(404)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html')
    expect(res.end).toHaveBeenCalledWith('<html>app</html>')
    expect(next).not.toHaveBeenCalled()
  })

  it.each([
    ['/trips/abc', 'text/html'],
    ['/trips', 'application/json'],
    ['/no/such/page', 'application/json'],
    ['/assets/app.js', ANY_TYPE],
    ['/logo.svg', 'text/html'],
    ['/auth/google', 'text/html'],
    ['/auth', 'text/html'],
  ])('passes %s (%s) through', async (url, accept) => {
    const { res, next } = await run(url, accept)
    expect(next).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it('passes other methods through', async () => {
    const { next } = await run('/no/such/page', 'text/html', 'POST')
    expect(next).toHaveBeenCalled()
  })
})
