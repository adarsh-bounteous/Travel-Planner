import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'

let fetchMock: ReturnType<typeof vi.fn>

const MESSAGES = [
  { to: 'a@example.com', trip_name: 'Lisbon', link: '/l/1', kind: 'confirmation', subject: 'Confirm A', sent_at: '2026-01-01T10:00:00Z' },
  { to: 'b@example.com', trip_name: 'Lisbon', link: '/l/2', kind: 'invite', subject: 'Invite B', sent_at: '2026-01-02T10:00:00Z' },
]

function stub(localMode: boolean, resetStatus = 204, inbox: unknown[] = []) {
  fetchMock = vi.fn(async (path: string) => {
    if (path === '/auth/me') {
      return new Response(JSON.stringify({ email: 'demo@example.com', method: 'email' }))
    }
    if (path === '/startup-status') return new Response(JSON.stringify({ local_mode: localMode }))
    if (path === '/local/reset') return new Response(null, { status: resetStatus })
    if (path === '/local/inbox') return new Response(JSON.stringify(inbox))
    return new Response('[]')
  })
  vi.stubGlobal('fetch', fetchMock)
}

function renderHome(entry = '/') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const resetCalls = () => fetchMock.mock.calls.filter(([path]) => path === '/local/reset')

async function openConfirm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reset local data' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('LocalMenu', () => {
  it('hides Reset local data when local mode is off', async () => {
    stub(false)
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/startup-status', expect.anything()),
    )
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Reset local data' })).not.toBeInTheDocument()
  })

  it('asks before resetting, then posts and returns to sign-in with the toast', async () => {
    stub(true)
    renderHome()
    await openConfirm()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'All local accounts and sessions will be deleted',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const toast = await screen.findByText('Local data reset. Sign in with the demo user.')
    expect(toast.closest('[role="status"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/local/reset',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('cancel leaves data alone', async () => {
    stub(true)
    renderHome()
    await openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(resetCalls()).toHaveLength(0)
  })

  it('shows an error and stays when reset fails', async () => {
    stub(true, 500)
    renderHome()
    await openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reset local data. Try again.')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('shows a Local inbox link in the Menu when local mode is on', async () => {
    stub(true)
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    const link = await screen.findByRole('link', { name: /Local inbox/ })
    expect(link).toHaveAttribute('href', '/local/inbox')
  })

  it('hides the Local inbox link when local mode is off', async () => {
    stub(false)
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/startup-status', expect.anything()),
    )
    await act(async () => {})
    expect(screen.queryByRole('link', { name: /Local inbox/ })).not.toBeInTheDocument()
  })

  it('opens the inbox and closes the Menu from the Local inbox link', async () => {
    stub(true)
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    fireEvent.click(await screen.findByRole('link', { name: /Local inbox/ }))
    expect(await screen.findByRole('heading', { name: 'Emails' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
  })

  it('lists the same messages from the Menu link as when opened directly', async () => {
    const titles = () => screen.findAllByRole('heading', { level: 3 }).then((h) => h.map((e) => e.textContent))
    stub(true, 204, MESSAGES)
    const direct = render(
      <MemoryRouter initialEntries={['/local/inbox']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    )
    const directTitles = await titles()
    direct.unmount()

    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    fireEvent.click(await screen.findByRole('link', { name: /Local inbox/ }))
    expect(await titles()).toEqual(directTitles)
    expect(directTitles).toEqual(['Confirm A', 'Invite B'])
  })
})
