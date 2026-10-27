import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const live = {
  'GET /startup-status': { status: 200, body: { local_mode: false } },
  'PUT /local/mode': { status: 403, body: { code: 'local_mode_not_allowed' } },
}

describe('Settings page', () => {
  it('shows local mode Off in a live deployment (AC9)', async () => {
    stubApi(live)
    renderAt('/account/settings')
    expect(await screen.findByRole('radio', { name: 'Off' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'On' })).not.toBeChecked()
  })

  it('refuses turning local mode on with a clear error and keeps it Off (AC8, AC9)', async () => {
    stubApi(live)
    renderAt('/account/settings')
    fireEvent.click(await screen.findByRole('radio', { name: 'On' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local mode is not allowed in live deployments',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Local mode is not allowed in live deployments',
    )
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'On' })).not.toBeChecked()
  })

  it('shows On when local mode is on', async () => {
    stubApi({ 'GET /startup-status': { status: 200, body: { local_mode: true } } })
    renderAt('/account/settings')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'On' })).toBeChecked())
  })
})
