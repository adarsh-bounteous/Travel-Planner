import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'

// @testing-library/user-event is not a dependency here, so drive the inputs with fireEvent.
const userEvent = {
  setup: () => ({
    type: async (element: HTMLElement, text: string) =>
      fireEvent.change(element, { target: { value: text } }),
    click: async (element: HTMLElement) => fireEvent.click(element),
  }),
}

type Reply = { status: number; body?: unknown }

function stubApi(method: 'email' | 'google', replies: Record<string, Reply> = {}) {
  const fetchMock = vi.fn(async (path: string) => {
    if (path === '/auth/me')
      return new Response(JSON.stringify({ email: 'maya@example.com', method }), { status: 200 })
    const reply = replies[path] ?? { status: 204 }
    return new Response(reply.body ? JSON.stringify(reply.body) : null, { status: reply.status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAccount() {
  render(
    <MemoryRouter initialEntries={['/account']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const currentEmailPassword = () =>
  screen.getByLabelText('Current password', { selector: '#current-password-email' })
const currentPasswordPassword = () =>
  screen.getByLabelText('Current password', { selector: '#current-password-password' })

afterEach(() => vi.unstubAllGlobals())

describe('AccountPage', () => {
  it('signs out (AC1)', async () => {
    const fetchMock = stubApi('email')
    renderAccount()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/sign-out',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('links to the traveller profile (AC6)', async () => {
    stubApi('email')
    renderAccount()
    expect(await screen.findByRole('link', { name: 'View your traveller profile' })).toHaveAttribute(
      'href',
      '/profile',
    )
  })

  it('shows no email or password change to a Google account (AC7)', async () => {
    stubApi('google')
    renderAccount()
    await screen.findByRole('heading', { name: 'Account' })
    expect(await screen.findByText('You sign in with Google.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save password' })).not.toBeInTheDocument()
  })

  it('confirms an email change and leaves the shown email alone (AC4)', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi('email', { '/auth/account/email': { status: 202 } })
    renderAccount()
    await screen.findByText('maya@example.com')
    await user.type(currentEmailPassword(), 'abcdefghij12')
    await user.type(screen.getByLabelText('New email address'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Save email' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Changes saved. Confirm a new email from the link we sent to it.',
    )
    expect(screen.getByText('maya@example.com')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/account/email',
      expect.objectContaining({
        body: JSON.stringify({ current_password: 'abcdefghij12', new_email: 'new@example.com' }),
      }),
    )
  })

  it('confirms a password change and clears the inputs (AC5)', async () => {
    const user = userEvent.setup()
    stubApi('email')
    renderAccount()
    await user.type(await screen.findByLabelText('New password'), 'newpassword12')
    await user.type(currentPasswordPassword(), 'abcdefghij12')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password changed. Use it the next time you sign in.',
    )
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(currentPasswordPassword()).toHaveValue('')
  })

  it('shows an inline neutral message beside the email field when it cannot be used (AC14, AC17)', async () => {
    const user = userEvent.setup()
    stubApi('email', {
      '/auth/account/email': { status: 409, body: { code: 'email_unavailable' } },
    })
    renderAccount()
    await user.type(await screen.findByLabelText('New email address'), 'taken@example.com')
    await user.type(currentEmailPassword(), 'abcdefghij12')
    await user.click(screen.getByRole('button', { name: 'Save email' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This email address can't be used. Enter a different email address.")
    expect(alert).not.toHaveTextContent(/already|exists|account/i)
    const field = screen.getByLabelText('New email address')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.closest('.field')).toContainElement(alert)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('asks for the current password without sending anything (AC15)', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi('email')
    renderAccount()
    await user.type(await screen.findByLabelText('New email address'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Save email' }))
    expect(
      await screen.findByText('Enter your current password to make this change.'),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/auth/account/email', expect.anything())
  })

  it('shows an inline message beside the password field for 11 characters (AC18)', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi('email')
    renderAccount()
    await user.type(await screen.findByLabelText('New password'), 'abcdefghi12')
    await user.type(currentPasswordPassword(), 'abcdefghij12')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Password is too short. Use at least 12 characters, with a letter and a number.',
    )
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalledWith('/auth/account/password', expect.anything())
  })

  it('says when the current password did not match', async () => {
    const user = userEvent.setup()
    stubApi('email', {
      '/auth/account/password': { status: 403, body: { code: 'wrong_password' } },
    })
    renderAccount()
    await user.type(await screen.findByLabelText('New password'), 'newpassword12')
    await user.type(currentPasswordPassword(), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That password didn't match. Try again.",
    )
  })
})
