import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

function mockMe(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/auth/me'
        ? new Response(JSON.stringify(body), { status })
        : new Response('[]'),
    ),
  )
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

afterEach(() => vi.unstubAllGlobals())

describe('NotFoundPage', () => {
  it('shows a not-found page for a URL that matches no route (AC1)', async () => {
    mockMe(200, { email: 'maya@example.com', method: 'email' })
    renderAt('/no/such/page')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My trips' })).not.toBeInTheDocument()
  })

  it('keeps known routes ahead of the catch-all (AC1)', async () => {
    mockMe(200, { email: 'maya@example.com', method: 'email' })
    renderAt('/saved')
    await screen.findByRole('banner')
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
  })

  it('states the requested page could not be found and echoes the address (AC2)', async () => {
    mockMe(200, { email: 'maya@example.com', method: 'email' })
    renderAt('/no/such/page?x=1')
    expect(await screen.findByText('The page you requested could not be found.')).toBeVisible()
    expect(screen.getByLabelText('Requested address')).toHaveTextContent('/no/such/page?x=1')
    expect(screen.getByText('404 Not Found')).toBeInTheDocument()
  })

  it('is not blank or redirected to sign in when signed out (AC3)', async () => {
    mockMe(401)
    renderAt('/no/such/page')
    const heading = await screen.findByRole('heading', { name: 'Page not found' })
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toBeEmptyDOMElement()
    expect(document.activeElement).toBe(heading)
  })

  it('links to Trips (AC4)', async () => {
    mockMe(200, { email: 'maya@example.com', method: 'email' })
    renderAt('/no/such/page')
    const link = await screen.findByRole('link', { name: 'Go to Trips' })
    expect(link).toHaveAttribute('href', '/')
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
  })
})
