// Screenshots of Home, My trips and the trip planner at 390px and 1280px, before ref vs current build.
// CLI: node scripts/capture-phase2.mjs [--before <ref>]   (not part of `pnpm run e2e`)
import { join } from 'node:path'
import { DEFAULT_BEFORE_REF, PAGE_SETUP, argValue, buildCurrent, buildRef, evidenceDir, serve } from './phase2-harness.mjs'

const WIDTHS = [390, 1280]

async function capture(dist, side, chromium) {
  let trips = []
  const { server, origin } = await serve(dist, () => trips)
  const browser = await chromium.launch()
  try {
    for (const [id, setup] of Object.entries(PAGE_SETUP)) {
      trips = setup.trips
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
        await page.goto(origin + setup.path, { waitUntil: 'networkidle' })
        await page.waitForSelector('h1, h2')
        await page.screenshot({ path: join(evidenceDir, `${id}-${side}-${width}.png`), fullPage: true })
        await page.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
}

const { chromium } = await import('@playwright/test')
await capture(buildRef(argValue('--before', DEFAULT_BEFORE_REF)), 'before', chromium)
await capture(buildCurrent(), 'after', chromium)
