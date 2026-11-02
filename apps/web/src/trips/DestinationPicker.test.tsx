import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { DestinationPicker } from './DestinationPicker'

const JAIPUR = { id: 'starter:India/Jaipur', name: 'Jaipur', region: 'India', kind: 'starter', fullGuide: true }
const AGRA = { id: 'live:agra.sig', name: 'Agra', region: 'Uttar Pradesh, India', kind: 'live', fullGuide: false }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(reply: object, initial = '') {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(reply))),
  )
  const onChange = vi.fn()
  function Host() {
    const [value, setValue] = useState(initial)
    return (
      <DestinationPicker
        idPrefix="test"
        value={value}
        onChange={(...args) => {
          const [next] = args
          onChange(...args)
          setValue(next)
        }}
      />
    )
  }
  render(<Host />)
  return onChange
}

async function type(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Destination' }), { target: { value: text } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
}

describe('DestinationPicker', () => {
  it('offers Agra when it is typed (AC1)', async () => {
    setup({ live: true, unavailable: false, matches: [AGRA] })
    await type('Agra')
    expect(screen.getByRole('button', { name: /Agra/ })).toBeInTheDocument()
  })

  it('lists starters before live places, and marks only starters Full guide (AC6, AC7, AC18)', async () => {
    setup({ live: true, unavailable: false, matches: [AGRA, JAIPUR] })
    await type('ja')
    const rows = screen.getAllByRole('button')
    expect(rows[0]).toHaveTextContent('Jaipur')
    expect(rows[1]).toHaveTextContent('Agra')
    expect(rows[0]).toHaveTextContent('Full guide')
    expect(rows[1]).not.toHaveTextContent('Full guide')
  })

  it('reports the destination and the signed ref of a live pick (AC2)', async () => {
    const onChange = setup({ live: true, unavailable: false, matches: [AGRA] })
    await type('Agra')
    fireEvent.click(screen.getByRole('button', { name: /Agra/ }))
    expect(onChange).toHaveBeenLastCalledWith('Agra, India', 'live:agra.sig')
    expect(screen.getByRole('button', { name: /Agra/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports a starter pick without a ref', async () => {
    const onChange = setup({ live: true, unavailable: false, matches: [JAIPUR] })
    await type('Jai')
    fireEvent.click(screen.getByRole('button', { name: /Jaipur/ }))
    expect(onChange).toHaveBeenLastCalledWith('Jaipur, India', undefined)
  })

  it('clears the choice when the text changes', async () => {
    const onChange = setup({ live: true, unavailable: false, matches: [AGRA] })
    await type('Agra')
    fireEvent.click(screen.getByRole('button', { name: /Agra/ }))
    await type('Agr')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('says live places are off and offers only starters (AC12, AC19)', async () => {
    setup({ live: false, unavailable: false, matches: [JAIPUR] })
    await type('Agra')
    expect(
      screen.getByText('Live places are off. Only starter destinations are searched.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Agra')).not.toBeInTheDocument()
  })

  it('shows the starters and a note when live search is unavailable (AC20, AC21)', async () => {
    setup({ live: true, unavailable: true, matches: [JAIPUR] })
    await type('Jai')
    expect(
      screen.getByText('Live results are unavailable right now; showing starter destinations only.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Jaipur')).toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    setup({ live: true, unavailable: false, matches: [] })
    await type('Zzzz')
    expect(screen.getByText(/No places match/)).toBeInTheDocument()
  })

  it('shows an already chosen destination without searching', () => {
    setup({ live: true, unavailable: false, matches: [] }, 'Agra, India')
    expect(screen.getByRole('searchbox', { name: 'Destination' })).toHaveValue('Agra, India')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the error from the form', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<DestinationPicker idPrefix="t" value="" onChange={() => {}} error="Choose a place." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a place.')
  })
})
