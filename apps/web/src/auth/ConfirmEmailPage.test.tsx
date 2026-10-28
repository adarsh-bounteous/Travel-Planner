import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from './AuthProvider'

let fetchMock: ReturnType<typeof vi.fn>

function stub(localMode: boolean) {
  fetchMock = vi.fn(async (path: string) => {
    if (path === '/startup-status') return new Response(JSON.stringify({ local_mode: localMode }))
    if (path === '/auth/me') return new Response(null, { status: 401 })
    return new Response('[]')
  })
  vi.stubGlobal('fetch', fetchMock)
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/confirm-email']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ConfirmEmailPage local inbox link', () => {
  it('shows a Local inbox link when local mode is on', async () => {
    stub(true)
    renderPage()
    expect(await screen.findByRole('link', { name: 'Local inbox' })).toHaveAttribute(
      'href',
      '/local/inbox',
    )
  })

  it('hides the link when local mode is off', async () => {
    stub(false)
    renderPage()
    await screen.findByRole('heading', { name: 'Confirm your email' })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/startup-status', expect.anything()),
    )
    expect(screen.queryByRole('link', { name: 'Local inbox' })).not.toBeInTheDocument()
  })

  it('opens the inbox from the link', async () => {
    stub(true)
    renderPage()
    fireEvent.click(await screen.findByRole('link', { name: 'Local inbox' }))
    expect(await screen.findByRole('heading', { name: 'Emails' })).toBeInTheDocument()
  })
})
