import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('shows the logo in the header link (AC1)', async () => {
    mockMe(401)
    renderAt('/sign-up')
    const header = await screen.findByRole('banner')
    const brand = within(header).getByRole('link', { name: 'Travel Planner' })
    expect(brand.querySelector('svg.brand-mark')).not.toBeNull()
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

  it('shows no Main navigation to a signed-out visitor', async () => {
    mockMe(401)
    renderAt('/sign-up')
    await screen.findByRole('link', { name: 'Sign in' })
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it.each(['/', '/saved', '/account'])('shows the logo and Main navigation on %s (AC1)', async (url) => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt(url)
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Travel Planner' })).toBeInTheDocument()
  })

  it('shows links in the order Trips, Explore, Saved, Account, without Bookings or Budget (AC2-5)', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/saved')
    const header = await screen.findByRole('banner')
    await within(header).findByRole('navigation', { name: 'Main' })
    const names = within(header)
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(names).toEqual(['Travel Planner', 'Trips', 'Explore', 'Saved', 'Account'])
    expect(within(header).getByRole('link', { name: 'Trips' })).toHaveAttribute('href', '/')
    expect(within(header).getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore')
    expect(within(header).getByRole('link', { name: 'Saved' })).toHaveAttribute('href', '/saved')
  })

  it('shows an icon from the set in every navigation link', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/saved')
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    for (const link of nav.getAllByRole('link')) expect(link.querySelector('svg.icon')).not.toBeNull()
  })

  it('shows an icon in the signed-out Sign in button', async () => {
    mockMe(401, {})
    renderAt('/sign-in')
    const header = await screen.findByRole('banner')
    expect(
      (await within(header).findByRole('link', { name: 'Sign in' })).querySelector('svg.icon'),
    ).not.toBeNull()
  })

  it('opens My trips from the logo (AC6)', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/saved')
    const header = await screen.findByRole('banner')
    fireEvent.click(await within(header).findByRole('link', { name: 'Travel Planner' }))
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
  })

  it('opens Explore and Trips from their links (AC7)', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/saved')
    fireEvent.click(await screen.findByRole('link', { name: 'Explore' }))
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
  })

  it('highlights no main link under no main section (AC8)', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/saved')
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    expect(nav.getByRole('link', { name: 'Trips' })).not.toHaveAttribute('aria-current')
    expect(nav.getByRole('link', { name: 'Explore' })).not.toHaveAttribute('aria-current')
  })

  it('highlights only the current section (AC9)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path.startsWith('/auth/me')
          ? new Response(JSON.stringify({ email: 'maya@example.com' }))
          : new Response('[]'),
      ),
    )
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByRole('link', { name: 'Explore' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Trips' })).not.toHaveAttribute('aria-current')
  })

  it('has no menu button and a visible navigation (AC10)', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/')
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('navigation', { name: 'Main' })).toBeVisible()
    expect(within(header).queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  })

  it('does not show the entry point to a signed-in traveller', async () => {
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/')
    await screen.findByRole('heading', { name: 'My trips' })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
