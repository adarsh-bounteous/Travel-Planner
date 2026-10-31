// Compares fresh builds of the pre-phase-2 commit and the current tree against a growth ceiling.
// CLI: node scripts/bundle-compare.mjs [--before <ref>]   (exits 1 when either figure is over the ceiling)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { DEFAULT_BEFORE_REF, argValue, buildCurrent, buildRef, evidenceDir } from './phase2-harness.mjs'

/**
 * @typedef {{ bytes: number, gzipBytes: number }} Size
 * @typedef {{ main: Size, largestRoute: Size, illustrations: Size & { count: number } }} BundleStats
 */

export const CEILING_PCT = 10

export function sizeOf(assets, file) {
  const buf = readFileSync(join(assets, file))
  return { file, bytes: buf.length, gzipBytes: gzipSync(buf).length }
}

// A lazy `./art/*.svg` import becomes a tiny chunk that only re-exports the asset URL or a data URI.
const isArtWrapper = (assets, file) => {
  const src = readFileSync(join(assets, file), 'utf8')
  return src.length < 8192 && /\.svg["'`]|data:image\/svg\+xml/.test(src)
}

/** Reads a built `dist`: entry chunk, largest other chunk and the illustration set, kept separate. */
export function measureDist(dist) {
  const assets = join(dist, 'assets')
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const entryFile = html.match(/src="\/assets\/([^"]+\.js)"/)?.[1]
  if (!entryFile) throw new Error(`No entry script found in ${dist}/index.html`)
  const files = readdirSync(assets)
  const wrappers = files.filter((f) => f.endsWith('.js') && f !== entryFile && isArtWrapper(assets, f))
  const art = [...files.filter((f) => f.endsWith('.svg')), ...wrappers].map((f) => sizeOf(assets, f))
  const main = sizeOf(assets, entryFile)
  const [largest] = files
    .filter((f) => f.endsWith('.js') && f !== entryFile && !wrappers.includes(f))
    .map((f) => sizeOf(assets, f))
    .sort((a, b) => b.bytes - a.bytes)
  return {
    main,
    largestRoute: largest ?? main,
    illustrations: {
      bytes: art.reduce((n, a) => n + a.bytes, 0),
      gzipBytes: art.reduce((n, a) => n + a.gzipBytes, 0),
      count: art.length,
    },
    sameChunk: !largest,
  }
}

const figure = (before, after, ceilingPct) => {
  const growthPct = before.bytes === 0 ? (after.bytes === 0 ? 0 : Infinity) : ((after.bytes - before.bytes) / before.bytes) * 100
  return {
    beforeBytes: before.bytes,
    afterBytes: after.bytes,
    beforeGzipBytes: before.gzipBytes,
    afterGzipBytes: after.gzipBytes,
    growthPct,
    withinCeiling: growthPct <= ceilingPct,
  }
}

/** @param {BundleStats} before @param {BundleStats} after */
export function compareBundles(before, after, ceilingPct = CEILING_PCT) {
  const main = figure(before.main, after.main, ceilingPct)
  const largestRoute = figure(before.largestRoute, after.largestRoute, ceilingPct)
  // The illustration set is reported on its own and has no ceiling: it is lazy, never part of main or a route.
  const illustrations = { ...figure(before.illustrations, after.illustrations, Infinity), beforeCount: before.illustrations.count, afterCount: after.illustrations.count }
  return { ceilingPct, main, largestRoute, illustrations, ok: main.withinCeiling && largestRoute.withinCeiling }
}

const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}%` : 'n/a')
const row = (label, f, verdict) =>
  `| ${label} | ${f.beforeBytes} | ${f.afterBytes} | ${f.beforeGzipBytes} | ${f.afterGzipBytes} | ${pct(f.growthPct)} | ${verdict} |`

export function renderReport(r, meta = {}) {
  const verdict = (f) => (f.withinCeiling ? `within ${r.ceilingPct}%` : `OVER ${r.ceilingPct}%`)
  const lines = [
    '# Phase 2 bundle report',
    '',
    meta.beforeRef ? `Before: fresh build of \`${meta.beforeRef}\`. After: fresh build of \`${meta.afterRef}\`. Sizes in bytes.` : 'Sizes in bytes.',
    '',
    '| Figure | Before | After | Before gzip | After gzip | Growth | Ceiling |',
    '|---|---|---|---|---|---|---|',
    row('Main bundle', r.main, verdict(r.main)),
    row('Largest route', r.largestRoute, verdict(r.largestRoute)),
    row(`Illustration set (${r.illustrations.afterCount} files, reported separately)`, r.illustrations, 'no ceiling'),
    '',
    `Illustration set: ${r.illustrations.afterBytes} bytes after (${r.illustrations.beforeBytes} before). It is lazy-loaded per image and is not counted in the main or largest route figures.`,
  ]
  if (meta.sameChunk) lines.push('', 'The app has no route-level code splitting, so the main bundle and the largest route are the same entry chunk.')
  lines.push('', r.ok ? `Result: both within the ${r.ceilingPct}% ceiling.` : `Result: FAILED, over the ${r.ceilingPct}% ceiling.`, '')
  return lines.join('\n')
}

async function main() {
  const beforeRef = argValue('--before', DEFAULT_BEFORE_REF)
  const before = measureDist(buildRef(beforeRef))
  const after = measureDist(buildCurrent())
  const report = compareBundles(before, after)
  const meta = { beforeRef, afterRef: 'current tree', sameChunk: after.sameChunk }
  writeFileSync(join(evidenceDir, 'bundle-report.json'), JSON.stringify({ ...meta, before, after, report }, null, 2) + '\n')
  writeFileSync(join(evidenceDir, 'bundle-report.md'), renderReport(report, meta))
  console.log(renderReport(report, meta))
  process.exit(report.ok ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
