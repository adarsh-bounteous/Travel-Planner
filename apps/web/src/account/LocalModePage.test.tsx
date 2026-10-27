import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('local mode settings page', () => {
  it('starts from the server value and turns the switch on', async () => {
    stubApi({
      'GET /local/mode': { status: 200, body: { local_mode: false } },
      'PUT /local/mode': { status: 200, body: { local_mode: true } },
    })
    renderAt('/account/local-mode')
    expect(await screen.findByLabelText('Off')).toBeChecked()
    fireEvent.click(screen.getByLabelText('On'))
    expect(await screen.findByLabelText('On')).toBeChecked()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the switch Off and says why in a live deployment (AC9, AC10)', async () => {
    stubApi({
      'GET /local/mode': { status: 200, body: { local_mode: false } },
      'PUT /local/mode': { status: 409, body: { code: 'local_mode_not_allowed' } },
    })
    renderAt('/account/local-mode')
    fireEvent.click(await screen.findByLabelText('On'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local mode is not allowed in live deployments.',
    )
    expect(screen.getByLabelText('Off')).toBeChecked()
  })
})
