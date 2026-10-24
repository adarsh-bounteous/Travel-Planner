import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

export type Reply = { status: number; body?: unknown }

/** Stubs fetch: the traveller is signed in, and other calls answer from `replies` ("METHOD path"). */
export function stubApi(
  replies: Record<string, Reply>,
  options: { signedOut?: boolean; email?: string } = {},
) {
  // A successful stubbed sign-in signs the traveller in for every later /auth/me.
  let signedOut = options.signedOut
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/auth/me')
      return signedOut
        ? new Response(null, { status: 401 })
        : new Response(
            JSON.stringify({ email: options.email ?? 'maya@example.com', method: 'email' }),
            { status: 200 },
          )
    const reply = replies[`${init?.method ?? 'GET'} ${path}`] ?? { status: 404 }
    if (path === '/auth/sign-in' && reply.status === 200) signedOut = false
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}
