import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from './AuthProvider'

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AuthProvider', () => {
  it('restores a persisted session from /auth/me (AC6-AC8)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path === '/trips'
          ? new Response('[]')
          : new Response(JSON.stringify({ email: 'maya@example.com' })),
      ),
    )
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument()
  })

  it('shows sign-in when there is no valid session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signs out and shows the sign-in page (AC5, AC9)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path === '/auth/me'
          ? new Response(JSON.stringify({ email: 'maya@example.com' }))
          : new Response(null, { status: 204 }),
      ),
    )
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your trips' })).not.toBeInTheDocument()
  })
})
