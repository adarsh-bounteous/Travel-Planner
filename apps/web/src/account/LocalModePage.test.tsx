import { fireEvent, screen, within } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

describe('local mode settings page', () => {
  it('starts from the server value and turns the switch on', async () => {
    stubApi({
      'GET /local/mode': { status: 200, body: { local_mode: false } },
      'GET /providers/status': { status: 200, body: { providers: [] } },
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
      'GET /providers/status': { status: 200, body: { providers: [] } },
      'PUT /local/mode': { status: 409, body: { code: 'local_mode_not_allowed' } },
    })
    renderAt('/account/local-mode')
    fireEvent.click(await screen.findByLabelText('On'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local mode is not allowed in live deployments.',
    )
    expect(screen.getByLabelText('Off')).toBeChecked()
  })

  describe('provider list', () => {
    const stubProviders = (providers: unknown[]) =>
      stubApi({
        'GET /local/mode': { status: 200, body: { local_mode: true } },
        'GET /providers/status': { status: 200, body: { providers } },
      })

    it('lists each provider with kind and health (AC4)', async () => {
      stubProviders([{ name: 'places', kind: 'maps and places', health: 'healthy' }])
      renderAt('/account/local-mode')
      const list = await screen.findByRole('list', { name: 'Registered providers' })
      const row = within(list).getByRole('listitem')
      expect(within(row).getByText('places')).toBeInTheDocument()
      expect(within(row).getByText('maps and places')).toBeInTheDocument()
      expect(within(row).getByText('Healthy')).toBeInTheDocument()
    })

    it('says no providers are registered (AC6)', async () => {
      stubProviders([])
      renderAt('/account/local-mode')
      expect(await screen.findByText('No providers are registered.')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Registered providers' })).toBeNull()
    })

    it('refuses a user who is not a developer (AC7)', async () => {
      stubApi({
        'GET /local/mode': { status: 200, body: { local_mode: false } },
        'GET /providers/status': { status: 404, body: { code: 'not_found' } },
      })
      renderAt('/account/local-mode')
      expect(await screen.findByRole('alert')).toHaveTextContent('This page is for developers only.')
      expect(screen.queryByRole('list', { name: 'Registered providers' })).toBeNull()
      // The switch that turns local mode On must stay reachable while it is Off.
      expect(screen.getByLabelText('Off')).toBeChecked()
    })

    it.each([401, 403])('refuses the provider list on a %i (AC7)', async (status) => {
      stubApi({
        'GET /local/mode': { status: 200, body: { local_mode: false } },
        'GET /providers/status': { status, body: {} },
      })
      renderAt('/account/local-mode')
      expect(await screen.findByRole('alert')).toHaveTextContent('This page is for developers only.')
    })

    it('shows health as a dot plus a text label (AC8)', async () => {
      stubProviders([
        { name: 'a', kind: 'k', health: 'healthy' },
        { name: 'b', kind: 'k', health: 'degraded' },
        { name: 'c', kind: 'k', health: 'open circuit' },
        { name: 'd', kind: 'k', health: 'not configured' },
      ])
      renderAt('/account/local-mode')
      await screen.findByRole('list', { name: 'Registered providers' })
      const expected = {
        Healthy: 'badge-success',
        Degraded: 'badge-warning',
        'Open circuit': 'badge-danger',
        'Not configured': 'badge-danger',
      }
      for (const [label, cls] of Object.entries(expected)) {
        const badge = screen.getByText(label).closest('.badge')!
        expect(badge).toHaveClass(cls)
        expect(badge.querySelector('.dot')).toHaveAttribute('aria-hidden', 'true')
      }
    })
  })
})
