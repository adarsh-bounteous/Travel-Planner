import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyStateArt } from './EmptyStateArt'

const srcRoot = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })
}

describe('EmptyStateArt', () => {
  it('shows a 16:9 generic illustration hidden from screen readers', async () => {
    const { container } = render(<EmptyStateArt />)
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    await waitFor(() => expect(container.querySelector('.imgc img')).not.toBeNull())
    expect(container.querySelector('.imgc img')).toHaveAttribute('aria-hidden', 'true')
  })

  it('is used by every file that renders an empty state', () => {
    const missing = sourceFiles(srcRoot).filter((f) => {
      const text = readFileSync(f, 'utf8')
      return /className="empty-state"/.test(text) && !/EmptyStateArt/.test(text)
    })
    expect(missing).toEqual([])
  })
})
