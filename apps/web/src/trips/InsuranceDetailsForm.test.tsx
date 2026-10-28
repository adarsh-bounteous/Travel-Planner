import { fireEvent, render, screen } from '@testing-library/react'
import { InsuranceDetailsForm } from './InsuranceDetailsForm'

const props = {
  initialOwnerAge: null,
  initialCompanionAges: [] as number[],
  busy: false,
  failed: false,
  onCompare: vi.fn(),
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const addCompanions = (value: string) => {
  type('Companion ages', value)
  fireEvent.click(screen.getByRole('button', { name: 'Add companion' }))
}

afterEach(() => vi.clearAllMocks())

describe('insurance details form', () => {
  it('shows the entered owner age and explains an invalid one (AC1)', () => {
    render(<InsuranceDetailsForm {...props} />)
    type('Owner age', '34')
    expect(screen.getByLabelText('Owner age')).toHaveValue('34')
    fireEvent.blur(screen.getByLabelText('Owner age'))
    expect(screen.queryByRole('alert')).toBeNull()
    type('Owner age', '12')
    fireEvent.blur(screen.getByLabelText('Owner age'))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an age from 18 to 99.')
    expect(screen.getByLabelText('Owner age')).toHaveValue('12')
  })

  it('rejects a non-numeric owner age', () => {
    render(<InsuranceDetailsForm {...props} />)
    type('Owner age', 'abc')
    fireEvent.blur(screen.getByLabelText('Owner age'))
    expect(screen.getByRole('alert')).toHaveTextContent('Use whole numbers only, such as 34.')
  })

  it('shows a risky activity as selected (AC2)', () => {
    render(<InsuranceDetailsForm {...props} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Skiing' }))
    expect(screen.getByRole('checkbox', { name: 'Skiing' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Scuba diving' })).not.toBeChecked()
  })

  it('shows companion ages in the field and as chips (AC3)', () => {
    render(<InsuranceDetailsForm {...props} />)
    addCompanions('8, 12')
    expect(screen.getByLabelText('Companion ages')).toHaveValue('8, 12')
    expect(screen.getByText(/Companion 1: 8 years/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove companion 2, age 12' })).toBeInTheDocument()
  })

  it('removes a companion chip and rewrites the field', () => {
    render(<InsuranceDetailsForm {...props} />)
    addCompanions('8, 12')
    fireEvent.click(screen.getByRole('button', { name: 'Remove companion 1, age 8' }))
    expect(screen.getByLabelText('Companion ages')).toHaveValue('12')
  })

  it('adds no chips for a bad companion entry (AC3)', () => {
    render(<InsuranceDetailsForm {...props} />)
    addCompanions('8, x')
    expect(screen.getByRole('alert')).toHaveTextContent('Use whole numbers only')
    expect(screen.getByRole('alert')).toHaveTextContent('"x"')
    expect(screen.queryByText(/Companion 1:/)).toBeNull()
  })

  it('enables Compare plans only when all three details are set (AC4)', () => {
    const onCompare = vi.fn()
    render(<InsuranceDetailsForm {...props} onCompare={onCompare} />)
    const compare = screen.getByRole('button', { name: 'Compare plans' })
    expect(compare).toBeDisabled()
    type('Owner age', '34')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Skiing' }))
    expect(compare).toBeDisabled()
    expect(screen.getByText('2 of 3 details done')).toBeInTheDocument()
    addCompanions('8')
    expect(compare).toBeEnabled()
    expect(screen.getByText('All set. Your plans are ready.')).toBeInTheDocument()
    fireEvent.click(compare)
    expect(onCompare).toHaveBeenCalledWith({ ownerAge: 34, companionAges: [8], activities: ['Skiing'] })
  })

  it('shows a save failure', () => {
    render(<InsuranceDetailsForm {...props} failed />)
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save your details.")
  })
})
