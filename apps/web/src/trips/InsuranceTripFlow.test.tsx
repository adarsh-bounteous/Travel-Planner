import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'
import type { Trip } from './api'
import { pick } from './insuranceFixtures'

afterEach(() => vi.unstubAllGlobals())

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Japan',
  destination: 'Japan',
  start_date: '2027-03-12',
  end_date: '2027-03-21',
  budget: 3000,
  currency: 'EUR',
  is_owner: true,
  can_edit: true,
  days: [],
  options: [],
  cost: {
    currency: 'EUR',
    total: 0,
    budget: 3000,
    over_budget_by: 0,
    missing_categories: [],
    unpriced_count: 0,
    unconvertible_count: 0,
    rates: [],
  },
  ...over,
})

const NEED = /^Insurance: /

describe('trip page insurance', () => {
  it('shows the need as not yet picked, with a link to the options (AC18)', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip() } })
    renderAt('/trips/t1')
    expect(await screen.findByText('Insurance: not yet picked')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Insurance options' })).toHaveAttribute(
      'href',
      '/trips/t1/insurance-options',
    )
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeDisabled()
  })

  it('shows the picked plan, adds it to the total and enables Book trip with the plan (AC7, AC9)', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip({ insurance: pick() }) } })
    renderAt('/trips/t1')
    expect(await screen.findByText('Insurance: Globetrek Adventure Plus picked')).toBeInTheDocument()
    const total = screen.getByRole('region', { name: 'Trip total' })
    expect(within(total).getByText('Insurance: Globetrek Adventure Plus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Book trip' }))
    const drawer = await screen.findByRole('dialog', { name: 'Book trip' })
    expect(within(drawer).getByText(/Insurance provider site: Globetrek Adventure Plus/)).toBeInTheDocument()
  })

  it('has no insurance amount in the total without a pick (AC8)', async () => {
    stubApi({ 'GET /trips/t1': { status: 200, body: trip() } })
    renderAt('/trips/t1')
    const total = await screen.findByRole('region', { name: 'Trip total' })
    expect(within(total).queryByText(NEED)).toBeNull()
  })

  it('asks the traveller to choose again when a saved change cleared the pick (AC13)', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip({ insurance: pick() }) },
      'PUT /trips/t1': { status: 200, body: trip({ destination: 'Lisbon', insurance: null }) },
    })
    renderAt('/trips/t1')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit trip' }))
    const drawer = await screen.findByRole('dialog', { name: 'Trip settings' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Insurance pick cleared')
    expect(dialog).toHaveTextContent('Trip details changed. Your insurance pick was cleared. Choose an insurance plan again.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Insurance: not yet picked')).toBeInTheDocument()
  })

  it('opens no dialog when a save leaves the pick alone, or there was no pick (AC13)', async () => {
    stubApi({
      'GET /trips/t1': { status: 200, body: trip() },
      'PUT /trips/t1': { status: 200, body: trip({ name: 'Japan 2027' }) },
    })
    renderAt('/trips/t1')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit trip' }))
    const drawer = await screen.findByRole('dialog', { name: 'Trip settings' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Japan 2027' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
