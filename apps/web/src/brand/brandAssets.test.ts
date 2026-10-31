import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARK_PATH } from '../components/BrandLogo'

const root = resolve(__dirname, '../..')
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')
const html = read('index.html')
const tokens = readFileSync(resolve(root, '../../design-system/tokens.css'), 'utf8')

function pngSize(file: string) {
  const b = readFileSync(resolve(root, file))
  expect(b.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

const token = (name: string) => tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))![1]

describe('brand assets', () => {
  it('logo is an SVG with the mark and the wordmark (AC2, AC3)', () => {
    const svg = read('public/brand/logo.svg')
    expect(svg).toMatch(/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain(MARK_PATH)
    expect(svg).toMatch(/Travel/)
    expect(svg).toMatch(/Planner/)
  })

  it('standalone SVG colours match the design tokens', () => {
    for (const file of ['public/brand/logo.svg', 'public/favicon.svg']) {
      const svg = read(file).toLowerCase()
      expect(svg).toContain(token('--color-primary'))
      expect(svg).toContain(token('--color-on-primary'))
    }
    expect(read('public/brand/logo.svg').toLowerCase()).toContain(token('--color-fg'))
  })

  it('favicon is an SVG linked from the head (AC4)', () => {
    expect(read('public/favicon.svg')).toMatch(/<svg[\s>]/)
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg"')
  })

  it('app icons are PNGs of the right size (AC5, AC6)', () => {
    expect(pngSize('public/icons/icon-192.png')).toEqual({ w: 192, h: 192 })
    expect(pngSize('public/icons/icon-512.png')).toEqual({ w: 512, h: 512 })
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-192.png"')
  })

  it('social preview is 1200x630 and advertised in the head (AC7)', () => {
    expect(pngSize('public/social-preview.png')).toEqual({ w: 1200, h: 630 })
    expect(html).toContain('<meta property="og:image" content="/social-preview.png"')
    expect(html).toContain('<meta property="og:image:width" content="1200"')
    expect(html).toContain('<meta property="og:image:height" content="630"')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
  })
})
