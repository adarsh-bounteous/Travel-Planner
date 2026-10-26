import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'

let fetchMock: ReturnType<typeof vi.fn>

function stub(localMode: boolean, resetStatus = 204) {
  fetchMock = vi.fn(async (path: string) => {
    if (path === '/auth/me') {
      return new Response(JSON.stringify({ email: 'demo@example.com', method: 'email' }))
    }
    if (path === '/startup-status') return new Response(JSON.stringify({ local_mode: localMode }))
    if (path === '/local/reset') return new Response(null, { status: resetStatus })
    return new Response('[]')
  })
  vi.stubGlobal('fetch', fetchMock)
}

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
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
})
