import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { DestinationPicker } from './DestinationPicker'

const CATALOGUE = [
  { name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] },
  { name: 'Portugal', places: ['Lisbon', 'Porto', 'Lagos'] },
  { name: 'India', places: ['Delhi', 'Jaipur', 'Goa'] },
  { name: 'Thailand', places: ['Bangkok', 'Phuket', 'Krabi'] },
  { name: 'Mexico', places: ['Oaxaca', 'Tulum', 'Merida'] },
  { name: 'Morocco', places: ['Marrakech', 'Fes', 'Rabat'] },
  { name: 'Peru', places: ['Cusco', 'Lima', 'Arequipa'] },
]

afterEach(() => vi.unstubAllGlobals())

function setup(initial = '', fetchReply: () => Response = () => new Response(JSON.stringify(CATALOGUE))) {
  vi.stubGlobal('fetch', vi.fn(async () => fetchReply()))
  const onChange = vi.fn()
  function Host() {
    const [value, setValue] = useState(initial)
    return (
      <DestinationPicker
        idPrefix="test"
        value={value}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Host />)
  return onChange
}

const search = async (text: string) => {
  fireEvent.click(await screen.findByRole('button', { name: /destination/i }))
  const box = screen.getByLabelText('Search places')
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: 'Enter' })
}

const optionTexts = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .slice(1)
    .map((o) => o.textContent)

describe('DestinationPicker', () => {
  it('is a dropdown with no free-text field (AC1)', async () => {
    setup()
    const trigger = await screen.findByRole('button', { name: /destination/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveTextContent('Type or pick a destination')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('lists the seven countries (AC3)', async () => {
    setup()
    await screen.findByLabelText('Country')
    expect(optionTexts('Country')).toEqual([
      'Japan',
      'Portugal',
      'India',
      'Thailand',
      'Mexico',
      'Morocco',
      'Peru',
    ])
  })

  it('lists only the chosen country\'s places (AC4)', async () => {
    setup()
    await screen.findByLabelText('Country')
    expect(screen.getByLabelText('Place')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Portugal' } })
    expect(optionTexts('Place')).toEqual(['Lisbon', 'Porto', 'Lagos'])
  })

  it('suggests one best match and confirms it (AC5, AC6)', async () => {
    const onChange = setup()
    await search('Lisbn')
    expect(screen.getAllByText(/Did you mean/)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Use Lisbon' }))
    expect(onChange).toHaveBeenLastCalledWith('Lisbon, Portugal')
    expect(screen.getByLabelText('Country')).toHaveValue('Portugal')
    expect(screen.getByLabelText('Place')).toHaveValue('Lisbon')
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument()
  })

  it('dismisses a suggestion with No thanks', async () => {
    setup()
    await search('Lisbn')
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }))
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument()
  })

  it('shows the no-match message and no suggestion (AC7, AC9)', async () => {
    setup()
    await search('Atlantis')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No country or place matches what you typed.',
    )
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument()
  })

  it('picks a place from the list', async () => {
    const onChange = setup()
    fireEvent.click(await screen.findByRole('button', { name: /destination/i }))
    fireEvent.click(screen.getByRole('option', { name: /Kyoto/ }))
    expect(onChange).toHaveBeenLastCalledWith('Kyoto, Japan')
    expect(screen.getByRole('button', { name: /destination/i })).toHaveTextContent('Kyoto, Japan')
  })

  it('clears the place when the country changes (AC10)', async () => {
    const onChange = setup('Lisbon, Portugal')
    expect(await screen.findByLabelText('Place')).toHaveValue('Lisbon')
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Japan' } })
    expect(screen.getByLabelText('Place')).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('shows a legacy destination as nothing chosen', async () => {
    setup('Norway')
    expect(await screen.findByLabelText('Country')).toHaveValue('')
  })

  it('says so when the catalogue fails to load', async () => {
    setup('', () => new Response(null, { status: 500 }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load the destinations. Reload to try again.",
    )
  })
})
