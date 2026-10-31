import { render } from '@testing-library/react'
import { ProgressBar } from './ProgressBar'
import { RouteLine } from './RouteLine'

describe('decorative motion components', () => {
  it('add no visible copy and are hidden from assistive tech (AC15, AC19)', () => {
    const { container } = render(<RouteLine />)
    expect(container).toHaveTextContent('')
    expect(container.querySelector('.route')).toHaveAttribute('aria-hidden', 'true')
    const bar = render(<ProgressBar running />)
    expect(bar.container).toHaveTextContent('')
    expect(bar.container.querySelector('.progress-fill.is-running')).not.toBeNull()
  })
})
