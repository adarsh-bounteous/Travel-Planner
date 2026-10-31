import { fireEvent, render, screen } from '@testing-library/react'
import { Overlay } from './Overlay'

describe.each(['drawer', 'modal'] as const)('Overlay %s', (kind) => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('animates in and out, closing once the exit ends (AC8, AC9)', () => {
    const onClose = vi.fn()
    render(
      <Overlay kind={kind} labelledBy="t" onClose={onClose}>
        <h2 id="t">T</h2>
      </Overlay>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('is-entering')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(dialog).toHaveClass('is-leaving')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.animationEnd(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('still closes when no animation event fires', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(
      <Overlay kind={kind} labelledBy="t" onClose={onClose}>
        <h2 id="t">T</h2>
      </Overlay>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    vi.advanceTimersByTime(300)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
