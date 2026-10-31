import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { illustrationLoaders } from '../illustrations/registry'
import { ImageFrame } from './ImageFrame'

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')
const landmark = { placeType: 'landmark' } as const

afterEach(() => vi.restoreAllMocks())

describe('ImageFrame frame', () => {
  it.each(['16/9', '4/3', '1/1'] as const)('sets the %s ratio before the image loads', (ratio) => {
    const { container } = render(<ImageFrame ratio={ratio} illustration={landmark} />)
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': ratio })
  })

  it('sizes the frame by aspect-ratio and positions children absolutely', () => {
    expect(css).toMatch(/\.imgc\s*\{[^}]*aspect-ratio: var\(--ratio\)/)
    expect(css).toMatch(/\.imgc > \*\s*\{[^}]*position: absolute[^}]*inset: 0/)
    expect(css).toMatch(/\.imgc-blur\s*\{[^}]*blur\(var\(--blur-placeholder\)\)/)
  })

  it('keeps the frame unchanged when the image loads', async () => {
    const { container } = render(<ImageFrame ratio="4/3" alt="x" illustration={landmark} />)
    const frame = container.querySelector('.imgc')!
    const style = frame.getAttribute('style')
    const img = await waitFor(() => {
      const el = container.querySelector('img')
      expect(el).not.toBeNull()
      return el!
    })
    fireEvent.load(img)
    expect(frame.getAttribute('style')).toBe(style)
    expect(frame.className).toBe('imgc is-loaded')
  })

  it('keeps the frame unchanged when a photo replaces the illustration', async () => {
    const { container, rerender } = render(<ImageFrame ratio="16/9" illustration={landmark} />)
    const frame = container.querySelector('.imgc')!
    const style = frame.getAttribute('style')
    rerender(<ImageFrame ratio="16/9" illustration={landmark} photo={{ src: '/p.jpg' }} />)
    expect(container.querySelector('.imgc')).toBe(frame)
    expect(frame.getAttribute('style')).toBe(style)
  })
})

describe('ImageFrame loading', () => {
  it('shows a blurred placeholder while a photo loads, then hides it', () => {
    const { container } = render(<ImageFrame ratio="1/1" illustration={landmark} photo={{ src: '/p.jpg' }} />)
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()
    expect(container.querySelector('.imgc')).not.toHaveClass('is-loaded')
    fireEvent.load(container.querySelector('img')!)
    expect(container.querySelector('.imgc')).toHaveClass('is-loaded')
  })

  it('shows a blurred placeholder while an illustration loads', async () => {
    const { container } = render(<ImageFrame ratio="1/1" illustration={landmark} />)
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()
  })

  it('lazy-loads photo and illustration images', async () => {
    const { container, rerender } = render(<ImageFrame ratio="1/1" illustration={landmark} />)
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy'))
    rerender(<ImageFrame ratio="1/1" illustration={landmark} photo={{ src: '/p.jpg' }} />)
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy')
  })
})

describe('ImageFrame alt text', () => {
  it('exposes the supplied alt text', async () => {
    render(<ImageFrame ratio="1/1" alt="Lisbon hills" illustration={{ destination: 'Lisbon', placeType: 'landmark' }} />)
    expect(await screen.findByRole('img', { name: 'Lisbon hills' })).toBeInTheDocument()
  })

  it('hides the image from screen readers without alt text', async () => {
    const { container } = render(<ImageFrame ratio="1/1" illustration={landmark} />)
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('ImageFrame photo and illustration', () => {
  it('shows the photo in place of the illustration', async () => {
    const { container, rerender } = render(<ImageFrame ratio="4/3" illustration={{ destination: 'Lisbon', placeType: 'landmark' }} />)
    await waitFor(() => expect(container.querySelector('img')!.getAttribute('src')).toMatch(/lisbon\.svg/))
    rerender(
      <ImageFrame ratio="4/3" illustration={{ destination: 'Lisbon', placeType: 'landmark' }} photo={{ src: '/lisbon.jpg', alt: 'Rooftops' }} />,
    )
    const img = screen.getByRole('img', { name: 'Rooftops' })
    expect(img).toHaveAttribute('src', '/lisbon.jpg')
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('requests only the displayed illustration', async () => {
    const spies = Object.fromEntries(
      Object.keys(illustrationLoaders).map((key) => [key, vi.spyOn(illustrationLoaders, key)]),
    )
    const { container } = render(<ImageFrame ratio="16/9" illustration={{ destination: 'Lisbon', country: 'Portugal', placeType: 'landmark' }} />)
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(spies['destination/lisbon']).toHaveBeenCalledTimes(1)
    for (const [key, spy] of Object.entries(spies)) {
      if (key !== 'destination/lisbon') expect(spy).not.toHaveBeenCalled()
    }
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })
})

describe('ImageFrame palette scene', () => {
  it('draws an inline SVG that reads the --pal variables, not an img (AC1, AC5)', () => {
    const { container } = render(<ImageFrame ratio="16/9" illustration={landmark} palette />)
    expect(container.querySelector('img')).toBeNull()
    const scene = screen.getByRole('img', { name: "Illustration in the trip's palette" })
    expect(scene.tagName.toLowerCase()).toBe('svg')
    for (const c of ['art-sky', 'art-sun', 'art-hill', 'art-deep', 'art-line']) {
      expect(scene.querySelector(`.${c}`)).not.toBeNull()
    }
    expect(scene).toHaveTextContent('')
  })
})
