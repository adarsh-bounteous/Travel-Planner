import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

function mockMe(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/trips'
        ? new Response('[]')
        : new Response(JSON.stringify(body), { status }),
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

describe('AppHeader', () => {
  it('shows the sign-in entry point to a signed-out visitor on a public page (AC6)', async () => {
    mockMe(401)
    renderAt('/sign-up')
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    )
  })

  it('opens the sign-in page when chosen (AC5)', async () => {
    mockMe(401)
    renderAt('/sign-up')
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an Account link in the header of a signed-in page (AC8)', async () => {
    mockMe(200, { email: 'maya@example.com', method: 'email' })
    renderAt('/')
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/account',
    )
  })

  it('opens the Account page from the header link (AC9)', async () => {
    mockMe(200, { email: 'maya@example.com', method: 'email' })
    renderAt('/')
    fireEvent.click(await within(await screen.findByRole('banner')).findByRole('link', { name: 'Account' }))
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
  })

  it('hides the Account link from a signed-out visitor', async () => {
    mockMe(401)
    renderAt('/sign-up')
    await screen.findByRole('link', { name: 'Sign in' })
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('does not show the entry point to a signed-in traveller', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Your trips' })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
