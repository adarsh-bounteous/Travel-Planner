import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, waitFor } from '@testing-library/react'
import { EmptyStateArt } from './EmptyStateArt'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.tsx') && !/\.test\.tsx$/.test(path) ? [path] : []
  })
}

describe('EmptyStateArt', () => {
  it('shows hidden, reserved 16:9 generic art (AC6, AC9, AC12, AC13)', async () => {
    const { container } = render(<EmptyStateArt />)
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toMatch(/generic\.svg/))
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  // Inline one-liners inside a card or list: art there would dwarf the sentence.
  const INLINE = ['trips/TransportTab.tsx', 'trips/TravelersTab.tsx']

  it('is used by every screen-level empty state (AC6)', () => {
    const missing = sources(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('className="empty-state"'))
      .filter((f) => !INLINE.some((i) => f.endsWith(i)))
      .filter((f) => !readFileSync(f, 'utf8').includes('<EmptyStateArt'))
      .map((f) => f.slice(SRC.length + 1))
    expect(missing).toEqual([])
  })
})
