// Renders each sample screen in mockups.html to screens/<name>.png.
// Run from the repo root: node docs/design/render-mockups.mjs
// Uses the Playwright already installed in apps/web and the system Edge (or Chrome) browser; no download.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../apps/web/package.json'))
const { chromium } = require('@playwright/test')

const out = join(here, 'screens')
mkdirSync(out, { recursive: true })

let browser
for (const channel of ['msedge', 'chrome', undefined]) {
  try { browser = await chromium.launch(channel ? { channel } : {}); break } catch {}
}
if (!browser) throw new Error('No Chromium browser found: install Edge or Chrome, or run `npx playwright install chromium`.')

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(join(here, 'mockups.html')).href)
for (const frame of await page.locator('.frame[data-shot]').all()) {
  const name = await frame.getAttribute('data-shot')
  await frame.screenshot({ path: join(out, `${name}.png`), animations: 'disabled' })
  console.log(`screens/${name}.png`)
}
await browser.close()
