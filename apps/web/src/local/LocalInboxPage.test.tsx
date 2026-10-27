import { screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('local inbox page', () => {
  it('lists the emails local mode would have sent, without signing in', async () => {
    stubApi(
      {
        'GET /local/inbox': {
          status: 200,
          body: [
            {
              to: 'ana@example.com',
              trip_name: 'Lisbon',
              link: 'http://localhost:5173/invite/tok1',
            },
          ],
        },
      },
      { signedOut: true },
    )
    renderAt('/local/inbox')
    expect(await screen.findByRole('heading', { name: 'Local inbox' })).toBeInTheDocument()
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'http://localhost:5173/invite/tok1' })).toHaveAttribute(
      'href',
      'http://localhost:5173/invite/tok1',
    )
  })

  it('lists a confirmation email as Confirm your email', async () => {
    stubApi(
      {
        'GET /local/inbox': {
          status: 200,
          body: [
            {
              to: 'ana@example.com',
              trip_name: '',
              link: 'http://localhost:5173/confirm-email/tok2',
              kind: 'confirmation',
            },
          ],
        },
      },
      { signedOut: true },
    )
    renderAt('/local/inbox')
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'http://localhost:5173/confirm-email/tok2' })).toBeInTheDocument()
  })

  it('says so when nothing has been sent', async () => {
    stubApi({ 'GET /local/inbox': { status: 200, body: [] } }, { signedOut: true })
    renderAt('/local/inbox')
    expect(await screen.findByText('No emails yet.')).toBeInTheDocument()
  })

  it('says the inbox is unavailable when local mode is off', async () => {
    stubApi({ 'GET /local/inbox': { status: 404 } }, { signedOut: true })
    renderAt('/local/inbox')
    expect(await screen.findByText('The local inbox is only available in local mode.')).toBeInTheDocument()
  })
})
