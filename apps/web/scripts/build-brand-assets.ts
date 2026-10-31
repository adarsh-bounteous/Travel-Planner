// Renders the app icons and the social preview as PNGs, from the design tokens, and writes them
// to public/. Run with `pnpm brand:assets`, then commit the output.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')
const tokens = readFileSync(resolve(here, '../../../design-system/tokens.css'), 'utf8')

const MARK_PATH = 'M12 34 C 18 14, 26 40, 35 15'
const mark = `<svg class="brand-mark" viewBox="0 0 48 48">
  <rect class="m-bg" width="48" height="48" rx="12"/>
  <path class="m-line" d="${MARK_PATH}"/>
  <circle class="m-dot" cx="12" cy="34" r="3.5"/>
  <circle class="m-dot" cx="35" cy="15" r="4.5"/>
</svg>`

const page = (body: string, width: number, height: number, extraCss = '') => `<!doctype html>
<html><head><style>
${tokens}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: var(--font-family-sans); }
.brand-mark .m-bg { fill: var(--color-primary); }
.brand-mark .m-line { fill: none; stroke: var(--color-on-primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.brand-mark .m-dot { fill: var(--color-on-primary); }
.brand-logo { display: inline-flex; align-items: center; gap: var(--space-2); }
.brand-word { font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); letter-spacing: -0.01em; line-height: 1; }
.brand-logo-inv { color: var(--color-on-primary); }
.brand-logo-inv .m-bg { fill: var(--color-on-primary); }
.brand-logo-inv .m-line { stroke: var(--color-primary); }
.brand-logo-inv .m-dot { fill: var(--color-primary); }
${extraCss}
</style></head><body>${body}</body></html>`

const icon = (size: number) =>
  page(`<div class="icon">${mark}</div>`, size, size, `.icon, .icon svg { width: ${size}px; height: ${size}px; display: block; }`)

const social = page(
  `<div class="social">
    <span class="brand-logo brand-logo-inv brand-logo-lg">${mark}<span class="brand-word">Travel Planner</span></span>
    <p>Plan the trip. Keep every day in one place.</p>
    <svg class="route" viewBox="0 0 200 80"><path d="M5 70 C 50 10, 90 90, 140 30 S 185 15, 195 10"/></svg>
  </div>`,
  1200,
  630,
  `.social { width: 1200px; height: 630px; background: var(--color-primary); color: var(--color-on-primary); display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: var(--space-5); padding: var(--space-6); position: relative; }
  .brand-logo-lg .brand-mark { width: calc(var(--size-control-lg) * 2); height: calc(var(--size-control-lg) * 2); }
  .brand-logo-lg .brand-word { font-size: calc(var(--font-size-xl) * 2); }
  .social p { font-size: calc(var(--font-size-xl) * 1.5); font-weight: var(--font-weight-bold); line-height: var(--line-height-tight); max-width: 70%; }
  .social svg.route { position: absolute; right: var(--space-6); bottom: var(--space-6); width: 40%; fill: none; stroke: var(--color-on-primary); stroke-width: 2; stroke-linecap: round; opacity: var(--opacity-disabled); }`,
)

const outputs = [
  { file: 'icons/icon-192.png', html: icon(192), width: 192, height: 192 },
  { file: 'icons/icon-512.png', html: icon(512), width: 512, height: 512 },
  { file: 'social-preview.png', html: social, width: 1200, height: 630 },
]

const browser = await chromium.launch()
for (const { file, html, width, height } of outputs) {
  const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await tab.setContent(html)
  await tab.screenshot({ path: resolve(publicDir, file), clip: { x: 0, y: 0, width, height } })
  await tab.close()
}
await browser.close()
