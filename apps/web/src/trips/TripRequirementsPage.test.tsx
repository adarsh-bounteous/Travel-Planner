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
  { traveller_id: null, name: 'You (owner)', citizenship: 'Ireland', residence: 'Ireland', health_status: 'None reported', medical: 'No extra requirements' },
  { traveller_id: 'a', name: 'Ana', citizenship: 'Canada', residence: 'Canada', health_status: 'Allergies', medical: 'Carry an allergy card and any medication in its original packaging' },
  { traveller_id: 'b', name: 'Ben', citizenship: '', residence: '', health_status: '', medical: null },
]

const open = () => {
  stubApi({
    'GET /trips/t1': { status: 200, body: trip },
    'GET /trips/t1/requirements': { status: 200, body: rows },
  })
  renderAt('/trips/t1/requirements')
}

describe('Trip requirements', () => {
  it('shows each traveller medical text and no visa tab', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Trip requirements' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Visa' })).not.toBeInTheDocument()
    expect(screen.getByText('Details needed')).toBeInTheDocument()
    expect(screen.getByText(/allergy card/)).toBeInTheDocument()
  })

  it('opens the details drawer from Enter details', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Enter details for Ben' }))
    expect(await screen.findByRole('dialog', { name: 'Ben' })).toBeInTheDocument()
  })
})
