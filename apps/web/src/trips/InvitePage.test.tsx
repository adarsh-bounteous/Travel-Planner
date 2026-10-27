import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

const invite = { status: 200, body: { email: 'ana@example.com', trip_name: 'Lisbon' } }

describe('invite page', () => {
  it('asks a signed-out visitor to sign in with the invited email, with no sign-up (AC11, AC15)', async () => {
    stubApi({ 'GET /invites/tok1': invite }, { signedOut: true })
    renderAt('/invite/tok1')
    expect(await screen.findByText(/Sign in with/)).toHaveTextContent(
      'Sign in with ana@example.com to open this trip.',
    )
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /sign up/i })).toBeNull()
  })

  it('offers no sign-up or Google on the sign-in page reached from an invite (AC15)', async () => {
    stubApi({ 'GET /invites/tok1': invite }, { signedOut: true })
    renderAt('/invite/tok1')
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull()
  })

  it('opens the trip for the invited account (AC2)', async () => {
    const fetchMock = stubApi(
      {
        'GET /invites/tok1': invite,
        'POST /invites/tok1/accept': { status: 200, body: { trip_id: 't1' } },
        'GET /trips/t1': { status: 200, body: { id: 't1', name: 'Lisbon', is_owner: false } },
      },
      { email: 'ana@example.com' },
    )
    renderAt('/invite/tok1')
    fireEvent.click(await screen.findByRole('button', { name: 'Open trip' }))
    expect(await screen.findByRole('heading', { name: 'Lisbon' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/invites/tok1/accept', expect.anything())
  })

  it('shows an error when the invite was already used (AC18)', async () => {
    stubApi(
      {
        'GET /invites/tok1': invite,
        'POST /invites/tok1/accept': { status: 409, body: { code: 'invite_used' } },
      },
      { email: 'ana@example.com' },
    )
    renderAt('/invite/tok1')
    fireEvent.click(await screen.findByRole('button', { name: 'Open trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has already been used.')
  })

  it('refuses a different account without sign-up (AC12, AC15)', async () => {
    stubApi({ 'GET /invites/tok1': invite }, { email: 'ben@example.com' })
    renderAt('/invite/tok1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Access refused')
    expect(screen.queryByRole('button', { name: 'Open trip' })).toBeNull()
    expect(screen.queryByRole('link', { name: /sign up/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Switch account' })).toBeInTheDocument()
  })

  it('says an unknown or revoked invite is no longer valid', async () => {
    stubApi({}, { signedOut: true })
    renderAt('/invite/gone')
    expect(await screen.findByText('This invite is no longer valid')).toBeInTheDocument()
  })
})
