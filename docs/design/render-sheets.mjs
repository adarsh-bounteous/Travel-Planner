// Combines the PNGs in screens/ into 5 labelled sheets in screens/sheets/, for tools that take at most 5 images.
// Run from the repo root after render-mockups.mjs: node docs/design/render-sheets.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../apps/web/package.json'))
const { chromium } = require('@playwright/test')

const SHEETS = [
  ['sheet-1-foundations', 'Foundations: tokens, components, states', [
    ['01-design-system', 'Design system sheet', 'All screens'],
    ['13-states', 'Empty, loading, error, 404, local inbox', 'All lists, NotFoundPage, /local/inbox'],
  ]],
  ['sheet-2-entry', 'Entry: sign in, my trips, new trip', [
    ['02-sign-in', 'Sign in', '/sign-in, /sign-up, /confirm-email'],
    ['03-my-trips', 'My trips (header + trip cards)', '/'],
    ['04-new-trip', 'New trip set-up (stepper)', '/trips/new, /trips/plan/*'],
  ]],
  ['sheet-3-trip', 'Trip: overview, itinerary, book trip', [
    ['05-trip-overview', 'Trip detail: Overview (hero, tabs, summary rail)', '/trips/:tripId'],
    ['06-itinerary', 'Itinerary tab', 'Itinerary tab'],
    ['11-book-trip-drawer', 'Book trip drawer (all drawers)', 'BookTripDrawer and other drawers'],
  ]],
  ['sheet-4-options', 'Options: shortlist card, compare, transport', [
    ['07-stay-shortlist', 'Shared option-card anatomy (stays)', 'Stays, SIMs, activities, restaurants, insurance'],
    ['08-compare-table', 'Comparison table', 'Stay, restaurant and insurance compare'],
    ['09-flights', 'Flights and transport', '/trips/:tripId/flights, Transport tab, /transport'],
  ]],
  ['sheet-5-explore-phone', 'Explore and phone layouts', [
    ['10-explore', 'Explore, recommendations, saved', '/explore, /destinations, Recommendations, /saved'],
    ['12-phone', 'Phone layouts (390px)', 'All screens at phone width'],
  ]],
]

const out = join(here, 'screens', 'sheets')
mkdirSync(out, { recursive: true })
let browser
for (const channel of ['msedge', 'chrome', undefined]) {
  try { browser = await chromium.launch(channel ? { channel } : {}); break } catch {}
}
if (!browser) throw new Error('No Chromium browser found: install Edge or Chrome, or run `npx playwright install chromium`.')
const page = await browser.newPage({ viewport: { width: 2000, height: 1000 }, deviceScaleFactor: 1 })

for (const [file, title, shots] of SHEETS) {
  const tiles = shots.map(([name, label, applies]) => `
    <figure><figcaption><b>${name.slice(0, 2)}</b> ${label}<span>Applies to: ${applies}</span></figcaption>
    <img src="${pathToFileURL(join(here, 'screens', name + '.png')).href}"></figure>`).join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#e2e8f0;font-family:"Segoe UI",system-ui,sans-serif;color:#0f172a}
    .wrap{width:1920px;padding:32px}
    h1{margin:0 0 4px;font-size:30px} p{margin:0 0 24px;color:#475569;font-size:16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}
    .grid.one{grid-template-columns:1fr}
    figure{margin:0;background:#fff;border-radius:14px;padding:14px;box-shadow:0 4px 16px rgb(0 0 0/.08)}
    figcaption{font-size:18px;font-weight:600;margin:0 0 10px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
    figcaption b{background:#0e7490;color:#fff;border-radius:99px;padding:1px 10px;font-size:14px}
    figcaption span{font-weight:400;color:#475569;font-size:14px;margin-left:auto}
    img{width:100%;display:block;border-radius:8px}
    .wide{grid-column:1/-1}
  </style><div class="wrap"><h1>Travel Planner v2: ${title}</h1>
  <p>Sample screens from docs/design/mockups.html. They specify look and layout only, not content: keep each real screen's current text and elements.</p>
  <div class="grid">${tiles}</div></div>`
  // With 3 tiles, the first spans both columns so nothing is left half-empty.
  const tmp = join(out, '_sheet.html')
  writeFileSync(tmp, shots.length === 3 ? html.replace('<figure>', '<figure class="wide">') : html)
  await page.goto(pathToFileURL(tmp).href)
  await page.waitForLoadState('networkidle')
  await page.locator('.wrap').screenshot({ path: join(out, `${file}.png`) })
  console.log(`screens/sheets/${file}.png`)
}
rmSync(join(out, '_sheet.html'))
await browser.close()
