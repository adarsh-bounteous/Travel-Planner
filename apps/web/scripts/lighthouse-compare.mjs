// Lighthouse performance and accessibility on three pages, before ref vs current build.
// CLI: node scripts/lighthouse-compare.mjs [--before <ref>]   (exits 1 when any after-score is lower)
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_BEFORE_REF, PAGE_SETUP, argValue, buildCurrent, buildRef, evidenceDir, serve } from './phase2-harness.mjs'

export const PAGES = [
  { id: 'home', label: 'Home' },
  { id: 'my-trips', label: 'My trips' },
  { id: 'trip-planner', label: 'Trip planner' },
]
export const RUNS = 3

export const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** Lists every page where the after score is lower than the before score. */
export function assertNoRegression(before, after) {
  const failures = []
  for (const [page, b] of Object.entries(before)) {
    const a = after[page]
    if (a.perf < b.perf) failures.push(`${page} performance ${b.perf} -> ${a.perf}`)
    if (a.a11y < b.a11y) failures.push(`${page} accessibility ${b.a11y} -> ${a.a11y}`)
  }
  return failures
}

export function renderLighthouseReport(before, after) {
  const failures = assertNoRegression(before, after)
  return [
    '# Phase 2 Lighthouse report',
    '',
    `Median of ${RUNS} runs per page, same machine, same settings (default Lighthouse mobile throttling), mocked API.`,
    '',
    '| Page | Performance before | Performance after | Accessibility before | Accessibility after |',
    '|---|---|---|---|---|',
    ...PAGES.map((p) => `| ${p.id} | ${before[p.id].perf} | ${after[p.id].perf} | ${before[p.id].a11y} | ${after[p.id].a11y} |`),
    '',
    failures.length ? `Result: FAILED\n\n${failures.map((f) => `- ${f}`).join('\n')}` : 'Result: no page scored lower after the polish.',
    '',
  ].join('\n')
}

async function measure(dist, chromium) {
  const { default: lighthouse } = await import('lighthouse')
  let trips = []
  const { server, origin } = await serve(dist, () => trips)
  const scores = {}
  try {
    for (const page of PAGES) {
      const setup = PAGE_SETUP[page.id]
      trips = setup.trips
      const perf = []
      const a11y = []
      for (let i = 0; i < RUNS; i++) {
        // Playwright's Chromium, with a debugging port Lighthouse attaches to.
        const port = 9300 + i
        const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] })
        try {
          const { lhr } = await lighthouse(origin + setup.path, { port, onlyCategories: ['performance', 'accessibility'], output: 'json', logLevel: 'error' })
          perf.push(Math.round(lhr.categories.performance.score * 100))
          a11y.push(Math.round(lhr.categories.accessibility.score * 100))
        } finally {
          await browser.close()
        }
      }
      scores[page.id] = { perf: median(perf), a11y: median(a11y), runs: { perf, a11y } }
    }
  } finally {
    server.close()
  }
  return scores
}

async function main() {
  const beforeRef = argValue('--before', DEFAULT_BEFORE_REF)
  const { chromium } = await import('@playwright/test')
  const before = await measure(buildRef(beforeRef), chromium)
  const after = await measure(buildCurrent(), chromium)
  writeFileSync(join(evidenceDir, 'lighthouse.json'), JSON.stringify({ beforeRef, runs: RUNS, before, after }, null, 2) + '\n')
  const md = renderLighthouseReport(before, after)
  writeFileSync(join(evidenceDir, 'lighthouse.md'), md)
  console.log(md)
  process.exit(assertNoRegression(before, after).length ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
