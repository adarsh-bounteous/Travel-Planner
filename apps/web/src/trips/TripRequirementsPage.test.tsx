import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const trip = {
  id: 't1',
  name: 'Kyoto in spring',
  destination: 'Kyoto, Japan',
  start_date: '2027-04-03',
  end_date: '2027-04-12',
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [],
  travellers: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }],
  editors: [],
}

const rows = [
  { traveller_id: null, name: 'You (owner)', citizenship: 'Ireland', residence: 'Ireland', health_status: 'None reported', visa: 'No visa needed for stays up to 90 days', medical: 'No extra requirements' },
  { traveller_id: 'a', name: 'Ana', citizenship: 'Canada', residence: 'Canada', health_status: 'Allergies', visa: 'No visa needed for stays up to 90 days', medical: 'Carry an allergy card and any medication in its original packaging' },
  { traveller_id: 'b', name: 'Ben', citizenship: '', residence: '', health_status: '', visa: null, medical: null },
]

const open = () => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/requirements': { status: 200, body: rows },
  })
  renderAt('/trips/t1/requirements')
}

describe('Trip requirements', () => {
  it('shows each traveller visa text on the Visa tab (AC2)', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Trip requirements' })).toBeInTheDocument()
    expect(screen.getAllByText('No visa needed for stays up to 90 days')).toHaveLength(2)
    expect(screen.getByText('Details needed')).toBeInTheDocument()
  })

  it('shows medical text on the Medical tab (AC3)', async () => {
    open()
    fireEvent.click(await screen.findByRole('tab', { name: 'Medical' }))
    expect(screen.getByText(/allergy card/)).toBeInTheDocument()
  })

  it('opens the details drawer from Enter details', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Enter details for Ben' }))
    expect(await screen.findByRole('dialog', { name: 'Ben' })).toBeInTheDocument()
  })
})
