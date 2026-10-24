import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import App from '../App'
import { AuthProvider } from './AuthProvider'

type Reply = { status: number; body?: unknown }

function mockApi(routes: Record<string, Reply>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      const reply = routes[path] ?? (path === '/trips' ? { status: 200, body: [] } : { status: 404 })
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status })
    }),
  )
}

function Location() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <App />
        <Location />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('RequireAuth', () => {
  it('sends a signed-out visitor to sign in with a fallback link (AC1)', async () => {
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'))
    expect(sessionStorage.getItem('returnTo')).toBe('/')
  })

  it('shows the redirect notice and fallback link while redirecting (AC1)', async () => {
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/')
    // The redirect notice is replaced by the sign-in page once navigation completes.
    expect(await screen.findByText(/You'll go to/)).toHaveTextContent(
      "You'll go to Trips after signing in.",
    )
  })

  it('renders no protected content while loading or signed out (AC4)', async () => {
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/')
    expect(screen.queryByRole('heading', { name: 'My trips' })).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByRole('heading', { name: 'My trips' })).not.toBeInTheDocument()
  })

  it('returns to the page asked for after signing in (AC2)', async () => {
    let signedIn = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/auth/sign-in') {
          signedIn = true
          return new Response('{}')
        }
        if (path === '/auth/me') {
          return signedIn
            ? new Response(JSON.stringify({ email: 'maya@example.com' }))
            : new Response('{}', { status: 401 })
        }
        if (path === '/trips') return new Response('[]')
        return new Response('{}', { status: 404 })
      }),
    )
    renderAt('/')
    expect(await screen.findByText(/You'll go to/)).toHaveTextContent(
      "You'll go to Trips after signing in.",
    )
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maya@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    expect(sessionStorage.getItem('returnTo')).toBeNull()
  })

  it('forwards to the remembered page when landing back signed in', async () => {
    sessionStorage.setItem('returnTo', '/trips')
    mockApi({ '/auth/me': { status: 200, body: { email: 'maya@example.com' } } })
    renderAt('/')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips'))
    expect(sessionStorage.getItem('returnTo')).toBeNull()
  })

  it('never shows the sign-in page to a signed-in traveller (AC3)', async () => {
    mockApi({ '/auth/me': { status: 200, body: { email: 'maya@example.com' } } })
    renderAt('/sign-in')
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('opens the app signed in without the sign-in page (AC3)', async () => {
    mockApi({ '/auth/me': { status: 200, body: { email: 'maya@example.com' } } })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
