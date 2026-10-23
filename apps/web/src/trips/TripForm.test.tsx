import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('TripForm', () => {
  it('asks for a trip name before saving', async () => {
    const fetchMock = stubApi({})
    renderAt('/trips/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Save trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a trip name')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
