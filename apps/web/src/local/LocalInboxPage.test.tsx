import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const confirmation = {
  to: 'new@example.com',
  trip_name: '',
  link: 'http://localhost:5173/confirm-email/tok2',
  kind: 'confirmation',
  subject: 'Confirm your sign-in',
  sent_at: '2026-01-02T03:04:05+00:00',
}
const invite = {
  to: 'ana@example.com',
  trip_name: 'Lisbon',
  link: 'http://localhost:5173/invite/tok1',
  kind: 'invite',
  subject: 'You are invited to a trip',
  sent_at: '2026-01-02T03:05:05+00:00',
}

const itinerary = {
  to: 'maya@example.com',
  trip_name: 'Lisbon',
  link: 'itinerary:abc',
  kind: 'itinerary',
  subject: 'Your Lisbon itinerary',
  sent_at: '2026-01-02T03:06:05+00:00',
  html: '<h1>Day by day</h1>',
}

describe('local inbox page', () => {
  it('opens an emailed itinerary as sandboxed HTML (AC4)', async () => {
    stubApi({ 'GET /local/inbox': { status: 200, body: [itinerary] } }, { signedOut: true })
    renderAt('/local/inbox')
    expect(await screen.findByText('Itinerary')).toHaveClass('badge')
    fireEvent.click(screen.getByRole('button', { name: 'Open email' }))
    const frame = screen.getByTitle('Your Lisbon itinerary')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('srcdoc', '<h1>Day by day</h1>')
    expect(screen.getByText('Pretend email. Nothing was sent to maya@example.com.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'itinerary:abc' })).not.toBeInTheDocument()
  })

  it('lists a card per email with its type badge, without signing in', async () => {
    stubApi({ 'GET /local/inbox': { status: 200, body: [invite, confirmation] } }, { signedOut: true })
    renderAt('/local/inbox')
    expect(await screen.findByRole('heading', { name: 'Emails' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('These emails were not sent anywhere')
    expect(screen.getByText('To ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('Sign-in')).toHaveClass('badge')
    expect(screen.getByText('Invite')).toHaveClass('badge')
    expect(screen.getAllByRole('button', { name: 'Open email' })).toHaveLength(2)
  })

  it('opens a confirmation email with a clickable link and a Complete sign-in action', async () => {
    stubApi({ 'GET /local/inbox': { status: 200, body: [confirmation] } }, { signedOut: true })
    renderAt('/local/inbox')
    fireEvent.click(await screen.findByRole('button', { name: 'Open email' }))
    expect(screen.getByRole('link', { name: confirmation.link })).toHaveAttribute('href', confirmation.link)
    expect(screen.getByRole('link', { name: 'Complete sign-in' })).toHaveAttribute('href', confirmation.link)
    expect(screen.getByText('Pretend email. Nothing was sent to new@example.com.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }))
    expect(screen.getByRole('heading', { name: 'Emails' })).toBeInTheDocument()
  })

  it('lists an email change as Confirm your new email address', async () => {
    stubApi(
      {
        'GET /local/inbox': {
          status: 200,
          body: [
            {
              to: 'new@example.com',
              trip_name: '',
              link: 'http://localhost:5173/confirm-email/tok3',
              kind: 'email_change',
              subject: 'Confirm your new email address',
              sent_at: '2026-01-01T00:00:00+00:00',
            },
          ],
        },
      },
      { signedOut: true },
    )
    renderAt('/local/inbox')
    expect(
      await screen.findByRole('heading', { name: 'Confirm your new email address' }),
    ).toBeInTheDocument()
    expect(screen.getByText('To new@example.com')).toBeInTheDocument()
  })

  it('opens an invite email with an Accept invite action', async () => {
    stubApi({ 'GET /local/inbox': { status: 200, body: [invite] } }, { signedOut: true })
    renderAt('/local/inbox')
    fireEvent.click(await screen.findByRole('button', { name: 'Open email' }))
    expect(screen.getByRole('link', { name: 'Accept invite' })).toHaveAttribute('href', invite.link)
  })

  it('says so when no emails have been generated', async () => {
    stubApi({ 'GET /local/inbox': { status: 200, body: [] } }, { signedOut: true })
    renderAt('/local/inbox')
    expect(
      await screen.findByRole('heading', { name: 'No emails have been generated yet' }),
    ).toBeInTheDocument()
  })

  it('is not shown when local mode is off', async () => {
    stubApi({ 'GET /local/inbox': { status: 404 } }, { signedOut: true })
    renderAt('/local/inbox')
    expect(await screen.findByRole('heading', { name: 'This page is not available' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Emails' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Trips' })).toHaveAttribute('href', '/')
  })
})
