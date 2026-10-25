import { fireEvent, screen } from '@testing-library/react'
import { renderAt, stubApi } from '../test-api'

afterEach(() => vi.unstubAllGlobals())

const BLANK = {
  display_name: '',
  home_city: '',
  dietary_notes: '',
  citizenship: '',
  residence: '',
  health_status: '',
  religion: '',
  diet: '',
  tastes: [],
  travel_style: '',
}

describe('ProfilePage', () => {
  it('shows a blank form when nothing is saved (AC7)', async () => {
    stubApi({ 'GET /profile': { status: 200, body: BLANK } })
    renderAt('/profile')
    expect(await screen.findByLabelText('Display name')).toHaveValue('')
    expect(screen.getByLabelText('Home city')).toHaveValue('')
  })

  it('prefills saved values and saves the form values (AC5)', async () => {
    const fetchMock = stubApi({
      'GET /profile': {
        status: 200,
        body: { ...BLANK, display_name: 'Maya', citizenship: 'Ireland', tastes: ['Food'] },
      },
      'PUT /profile': { status: 200, body: BLANK },
    })
    renderAt('/profile')
    expect(await screen.findByLabelText('Display name')).toHaveValue('Maya')
    fireEvent.change(screen.getByLabelText('Home city'), { target: { value: 'Leeds' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    // The set-up answers ride along untouched, so editing the three fields never wipes them.
    expect(JSON.parse(put![1]!.body as string)).toEqual({
      ...BLANK,
      display_name: 'Maya',
      home_city: 'Leeds',
      citizenship: 'Ireland',
      tastes: ['Food'],
    })
  })
})
