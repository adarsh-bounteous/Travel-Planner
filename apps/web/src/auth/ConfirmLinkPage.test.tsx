import { screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('confirmation link page', () => {
  it('confirms the account and offers sign in', async () => {
    stubApi({ 'POST /auth/confirm': { status: 200, body: { status: 'confirmed' } } }, { signedOut: true })
    renderAt('/confirm-email/tok1')
    expect(await screen.findByText('Your email is confirmed')).toBeVisible()
    for (const link of screen.getAllByRole('link', { name: 'Sign in' })) {
      expect(link).toHaveAttribute('href', '/sign-in')
    }
  })

  it.each([
    [410, 'link_expired', /has expired/i],
    [409, 'link_already_used', /already been used/i],
    [404, 'link_invalid', /not valid/i],
  ])('shows the message for %i', async (status, code, text) => {
    stubApi({ 'POST /auth/confirm': { status, body: { code } } }, { signedOut: true })
    renderAt('/confirm-email/tok1')
    expect(await screen.findByText(text)).toBeVisible()
  })
})
