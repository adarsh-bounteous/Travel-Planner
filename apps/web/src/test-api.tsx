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
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/auth/me')
      return options.signedOut
        ? new Response(null, { status: 401 })
        : new Response(
            JSON.stringify({ email: options.email ?? 'maya@example.com', method: 'email' }),
            { status: 200 },
          )
    const reply = replies[`${init?.method ?? 'GET'} ${path}`] ?? { status: 404 }
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
