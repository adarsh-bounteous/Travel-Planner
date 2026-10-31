// Run after `pnpm run build`: records main and largest-route bundle sizes.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'dist', 'assets')
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8')
const entryFile = html.match(/src="\/assets\/([^"]+\.js)"/)?.[1]
if (!entryFile) throw new Error('No entry script found in dist/index.html')

const size = (file) => {
  const buf = readFileSync(join(assets, file))
  return { file, bytes: buf.length, gzipBytes: gzipSync(buf).length }
}

const main = size(entryFile)
const others = readdirSync(assets)
  .filter((f) => f.endsWith('.js') && f !== entryFile)
  .map(size)
  .sort((a, b) => b.bytes - a.bytes)

const largestRoute = others[0]
  ? { ...others[0], note: 'Largest non-entry JS chunk.' }
  : { ...main, note: 'No route-level code splitting yet: the entry chunk is the largest route.' }

const commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()

writeFileSync(
  join(root, 'bundle-baseline.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), commit, unit: 'bytes', main, largestRoute }, null, 2) + '\n',
)
