import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from './AuthProvider'

type Reply = { status: number; body?: unknown }

function mockApi(routes: Record<string, Reply>) {
  const fetchMock = vi.fn(async (path: string) => {
    const reply = routes[path] ?? { status: 404 }
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function submitSignIn(email: string, password: string) {
  await screen.findByRole('heading', { name: 'Sign in' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('SignInPage', () => {
  it('shows the wrong-password message and keeps the email (AC10)', async () => {
    mockApi({
      '/auth/me': { status: 401 },
      '/auth/sign-in': { status: 401, body: { code: 'wrong_password' } },
    })
    renderAt('/sign-in')
    await submitSignIn('maya@example.com', 'nope')
    expect(await screen.findByRole('alert')).toHaveTextContent('Password did not match. Try again.')
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('says no account exists and links to sign up (AC11)', async () => {
    mockApi({
      '/auth/me': { status: 401 },
      '/auth/sign-in': { status: 404, body: { code: 'no_account' } },
    })
    renderAt('/sign-in')
    await submitSignIn('nobody@example.com', 'abcdefghij12')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No account exists for that email.')
    expect(within(alert).getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/sign-up')
  })

  it('offers to resend when the email is not confirmed (AC13)', async () => {
    mockApi({
      '/auth/me': { status: 401 },
      '/auth/sign-in': { status: 403, body: { code: 'email_not_confirmed' } },
    })
    renderAt('/sign-in')
    await submitSignIn('pending@example.com', 'abcdefghij12')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirm your email address before signing in.',
    )
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeInTheDocument()
  })

  it('shows the Google cancelled message (AC12)', async () => {
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/sign-in?error=google_cancelled')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in with Google was cancelled. Try again or sign in with email and password.',
    )
  })

  it('directs an unlinked Google account to sign up (AC19, AC20)', async () => {
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/sign-in?error=google_not_linked')
    const dialog = await screen.findByRole('dialog', { name: 'No account yet' })
    expect(within(dialog).getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('signs in and shows My trips (AC3)', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (path: string) => {
      calls.push(path)
      const signedIn = calls.includes('/auth/sign-in')
      if (path === '/auth/me') {
        return signedIn
          ? new Response(JSON.stringify({ email: 'maya@example.com' }))
          : new Response('{}', { status: 401 })
      }
      return new Response(path === '/trips' ? '[]' : '{}')
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAt('/sign-in')
    await submitSignIn('maya@example.com', 'abcdefghij12')
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
  })

  describe('demo account hint', () => {
    const demo = { email: 'demo@example.com', password: 'demo-password-1' }
    const status = (demo_account: unknown) => ({
      '/auth/me': { status: 401 },
      '/startup-status': { status: 200, body: { local_mode: true, demo_account } },
    })

    afterEach(() => sessionStorage.clear())

    it('offers the demo details and fills them in', async () => {
      mockApi(status(demo))
      renderAt('/sign-in')
      expect(await screen.findByText('Demo account is ready')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Fill in demo details' }))
      expect(screen.getByLabelText('Email')).toHaveValue('demo@example.com')
      expect(screen.getByLabelText('Password')).toHaveValue('demo-password-1')
    })

    it('shows no hint when there is no demo account', async () => {
      mockApi(status(null))
      renderAt('/sign-in')
      await screen.findByRole('heading', { name: 'Sign in' })
      expect(screen.queryByText('Demo account is ready')).toBeNull()
    })

    it('shows no hint and no error when the status call fails', async () => {
      mockApi({ '/auth/me': { status: 401 } })
      renderAt('/sign-in')
      await screen.findByRole('heading', { name: 'Sign in' })
      expect(screen.queryByText('Demo account is ready')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('keeps the return-to notice next to the hint', async () => {
      sessionStorage.setItem('returnTo', '/trips')
      mockApi(status(demo))
      renderAt('/sign-in')
      expect(await screen.findByText('Demo account is ready')).toBeInTheDocument()
      expect(screen.getByText(/You'll go to/)).toBeInTheDocument()
    })
  })
})
