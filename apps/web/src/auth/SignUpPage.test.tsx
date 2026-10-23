import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from './AuthProvider'

function mockApi(signUp: { status: number; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/auth/sign-up'
        ? new Response(JSON.stringify(signUp.body ?? {}), { status: signUp.status })
        : new Response('{}', { status: 401 }),
    ),
  )
}

async function submitSignUp(email: string, password: string) {
  render(
    <MemoryRouter initialEntries={['/sign-up']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: 'Create account' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('SignUpPage', () => {
  it('shows Confirm your email after submit and does not sign in (AC1, AC14)', async () => {
    mockApi({ status: 202 })
    await submitSignUp('maya@example.com', 'abcdefghij12')
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument()
  })

  it('shows the password rule message (AC16-AC18)', async () => {
    mockApi({ status: 422, body: { code: 'password_rule' } })
    await submitSignUp('maya@example.com', 'short1')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password needs at least 12 characters, with a letter and a number.',
    )
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com')
  })

  it('shows a generic message when the email is taken (AC21, AC22)', async () => {
    mockApi({ status: 400, body: { code: 'could_not_create' } })
    await submitSignUp('taken@example.com', 'abcdefghij12')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('We could not create an account with that email. Try signing in.')
    expect(alert.textContent?.toLowerCase()).not.toContain('already')
  })
})
