import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Trip } from './api'

afterEach(() => vi.unstubAllGlobals())

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Lisbon',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [{ date: '2027-03-03', name: 'Day 1' }],
  travellers: [],
  editors: [],
  ...overrides,
})

const openTab = async (t: Trip, extra = {}) => {
  const fetchMock = stubApi({ 'GET /trips/t1': { status: 200, body: t }, ...extra })
  renderAt('/trips/t1')
  fireEvent.click(await screen.findByRole('tab', { name: 'Travelers' }))
  return fetchMock
}

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

describe('Travelers tab', () => {
  it('adds a traveller by name (AC1)', async () => {
    await openTab(trip(), {
      'POST /trips/t1/travellers': {
        status: 201,
        body: trip({ travellers: [{ id: 'x1', name: 'Ana' }] }),
      },
    })
    fireEvent.change(screen.getByLabelText('Traveller name'), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add traveller' }))
    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(await screen.findByText('Ana added to the trip.')).toBeInTheDocument()
    expect(screen.getByLabelText('Traveller name')).toHaveValue('')
  })

  it('lists exactly the travellers on the trip (AC9)', async () => {
    await openTab(
      trip({
        travellers: [
          { id: 'a', name: 'Ana' },
          { id: 'b', name: 'Ben' },
        ],
      }),
    )
    const list = screen.getByRole('list', { name: 'Travellers on this trip' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'AAna',
      'BBen',
    ])
  })

  it('refuses a blank name with a message and changes nothing (AC16, AC17)', async () => {
    const fetchMock = await openTab(trip({ travellers: [{ id: 'a', name: 'Ana' }] }))
    const input = screen.getByLabelText('Traveller name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add traveller' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a traveller name to add them to this trip.',
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(posts(fetchMock)).toHaveLength(0)
    const list = screen.getByRole('list', { name: 'Travellers on this trip' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['AAna'])
  })

  it('revokes an editor and offers undo (AC3)', async () => {
    await openTab(
      trip({
        editors: [
          { email: 'ana@example.com', accepted: true },
          { email: 'ben@example.com', accepted: false, invite_url: '/invite/tok' },
        ],
      }),
      {
        'DELETE /trips/t1/editors/ana%40example.com': {
          status: 200,
          body: trip({ editors: [{ email: 'ben@example.com', accepted: false }] }),
        },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for ana@example.com' }))
    expect(
      await screen.findByText(
        'Access revoked for ana@example.com. The trip is no longer shown to them.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('ana@example.com', { selector: 'span' })).not.toBeInTheDocument()
    expect(screen.getByText('ben@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('invites an editor and refuses a malformed email (AC2 owner side)', async () => {
    const fetchMock = await openTab(trip(), {
      'POST /trips/t1/editors': {
        status: 201,
        body: trip({ editors: [{ email: 'ana@example.com', accepted: false, invite_url: '/invite/t' }] }),
      },
    })
    const input = screen.getByLabelText('Email to invite as editor')
    fireEvent.change(input, { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite editor' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address, like ana@example.com.',
    )
    expect(posts(fetchMock)).toHaveLength(0)
    fireEvent.change(input, { target: { value: 'ana@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite editor' }))
    expect(await screen.findByText('Invited')).toBeInTheDocument()
  })

  it('shows an editor the travellers but no owner controls (AC7, AC8)', async () => {
    await openTab(
      trip({ is_owner: false, travellers: [{ id: 'a', name: 'Ana' }] }),
    )
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add traveller' })).toBeNull()
    expect(screen.queryByLabelText('Traveller name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Invite editor' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Revoke access/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit trip' })).toBeNull()
  })
})
