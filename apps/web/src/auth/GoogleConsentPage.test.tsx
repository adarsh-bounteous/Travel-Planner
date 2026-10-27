import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { GoogleConsentPage } from './GoogleConsentPage'
import { fetchGoogleIdentities, finishGoogle } from './api'

vi.mock('./api', () => ({
  fetchGoogleIdentities: vi.fn(),
  finishGoogle: vi.fn(),
}))

const TYPED = 'Or type an email address'

beforeEach(() => {
  vi.mocked(fetchGoogleIdentities).mockResolvedValue([
    { email: 'alex@example.com', has_account: true },
    { email: 'sam@example.com', has_account: true },
    { email: 'new.user@example.com', has_account: false },
  ])
})

afterEach(() => vi.clearAllMocks())

function renderPage(url = '/local/google-consent?state=abc') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <GoogleConsentPage />
    </MemoryRouter>,
  )
}

describe('GoogleConsentPage', () => {
  it('lists known identities, the email field and Allow and Cancel (AC6, AC8, AC9)', async () => {
    renderPage()
    expect(await screen.findByRole('radio', { name: /alex@example.com/ })).toBeInTheDocument()
    expect(screen.getAllByText('Has account')).toHaveLength(2)
    expect(screen.getByText('No account yet')).toBeInTheDocument()
    expect(screen.getByLabelText(TYPED)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('allows the selected identity (AC1, AC5)', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('radio', { name: /sam@example.com/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(finishGoogle).toHaveBeenCalledWith('abc', { email: 'sam@example.com' })
  })

  it('allows a typed email and clears the selected identity (AC2, AC7)', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('radio', { name: /sam@example.com/ }))
    fireEvent.change(screen.getByLabelText(TYPED), { target: { value: 'alex@example.com' } })
    expect(screen.getByRole('radio', { name: /sam@example.com/ })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(finishGoogle).toHaveBeenLastCalledWith('abc', { email: 'alex@example.com' })
  })

  it('cancels without signing in (AC3, AC4)', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('radio', { name: /alex@example.com/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(finishGoogle).toHaveBeenLastCalledWith('abc', 'cancel')
  })

  it('shows an error and does not sign in for a malformed email (AC10, AC11)', async () => {
    renderPage()
    await screen.findByRole('radio', { name: /alex@example.com/ })
    fireEvent.change(screen.getByLabelText(TYPED), { target: { value: 'alex@example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(screen.getByText('Enter a valid email address.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent("You're not signed in.")
    expect(screen.getByLabelText(TYPED)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(TYPED)).toHaveValue('alex@example')
    expect(finishGoogle).not.toHaveBeenCalled()
  })

  it('shows an error and does not sign in when nothing is chosen (AC10, AC11)', async () => {
    renderPage()
    await screen.findByRole('radio', { name: /alex@example.com/ })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(screen.getByText('Choose an identity or enter an email address.')).toBeVisible()
    expect(finishGoogle).not.toHaveBeenCalled()
  })

  it('disables Allow when the state is missing', async () => {
    renderPage('/local/google-consent')
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeDisabled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
