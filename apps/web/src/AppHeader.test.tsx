import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

function mockMe(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
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

  it('does not show the entry point to a signed-in traveller', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/')
    await screen.findByRole('heading', { name: 'Your trips' })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
