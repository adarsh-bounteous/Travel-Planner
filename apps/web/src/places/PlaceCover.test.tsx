import { render, screen } from '@testing-library/react'
import { PlaceCover, coverVariant } from './PlaceCover'

describe('PlaceCover', () => {
  it('is an empty gradient tile with no photo (AC1, AC12)', () => {
    render(<PlaceCover seed="p1" />)
    const cover = screen.getByTestId('place-cover')
    expect(cover.className).toMatch(/\bcover-[0-3]\b/)
    expect(cover).toBeEmptyDOMElement()
    expect(cover.querySelector('img')).toBeNull()
  })

  it('picks the same variant for the same seed', () => {
    expect(coverVariant('p1')).toBe(coverVariant('p1'))
    expect(coverVariant('p1')).toBeGreaterThanOrEqual(0)
    expect(coverVariant('p1')).toBeLessThan(4)
  })
})
