import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteTransition } from './RouteTransition'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')
const doc = document as unknown as Record<string, unknown>

afterEach(() => {
  delete doc.startViewTransition
})

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/saved']}>
      <nav>
        <Link to="/account">To account</Link>
        <Link to="/saved?x=1">Saved with search</Link>
      </nav>
      <RouteTransition>
        {(location) => (
          <Routes location={location}>
            <Route path="/saved" element={<p>Saved page</p>} />
            <Route path="/account" element={<p>Account page</p>} />
          </Routes>
        )}
      </RouteTransition>
    </MemoryRouter>,
  )

const stubVt = () => {
  const start = vi.fn((cb: () => void) => {
    cb()
    return { finished: Promise.resolve() }
  })
  doc.startViewTransition = start
  return start
}

describe('RouteTransition with View Transitions (AC1)', () => {
  it('runs the page change inside startViewTransition', async () => {
    const start = stubVt()
    setup()
    expect(start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'To account' }))
    expect(start).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('ignores a search-only change', () => {
    const start = stubVt()
    setup()
    fireEvent.click(screen.getByRole('link', { name: 'Saved with search' }))
    expect(start).not.toHaveBeenCalled()
  })

  it('keeps focus and adds no live region (AC7)', async () => {
    stubVt()
    const { container } = setup()
    const link = screen.getByRole('link', { name: 'To account' })
    link.focus()
    fireEvent.click(link)
    await screen.findByText('Account page')
    expect(document.activeElement).toBe(link)
    expect(container.querySelector('[aria-live],[role="status"],[role="alert"]')).toBeNull()
  })
})

describe('RouteTransition fallback (AC2)', () => {
  it('animates the page with route-anim until the animation ends', async () => {
    const { container } = setup()
    expect(container.querySelector('.route-anim')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'To account' }))
    expect(await screen.findByText('Account page')).toBeInTheDocument()
    const animated = container.querySelector('.route-anim')
    expect(animated).not.toBeNull()
    fireEvent.animationEnd(animated as Element)
    expect(container.querySelector('.route-anim')).toBeNull()
  })

  it('keeps focus and adds no live region (AC7)', async () => {
    const { container } = setup()
    const link = screen.getByRole('link', { name: 'To account' })
    link.focus()
    fireEvent.click(link)
    await screen.findByText('Account page')
    expect(document.activeElement).toBe(link)
    expect(container.querySelector('[aria-live],[role="status"],[role="alert"]')).toBeNull()
  })

  it('defines the route-in keyframes and uses them for .route-anim', () => {
    expect(css).toMatch(/@keyframes route-in/)
    expect(css).toMatch(/\.route-anim\s*\{[^}]*animation:\s*route-in var\(--route-duration\)/)
  })
})
