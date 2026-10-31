// Shared by the phase 2 closing checks: fresh builds of the before ref and the current tree, and a
// static server with a mocked API so both builds are measured against identical data.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const repoRoot = resolve(webRoot, '..', '..')
export const evidenceDir = join(repoRoot, 'docs', 'design', 'after', 'phase-2')
/** The commit just before phase 2 work started (the plan commit of the first phase 2 story). */
export const DEFAULT_BEFORE_REF = '2b1c9e9'

mkdirSync(evidenceDir, { recursive: true })

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

export function argValue(name, fallback) {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Fresh build of `ref` in a git worktree under the gitignored build/ dir; returns its web dist dir. */
export function buildRef(ref) {
  const tree = join(repoRoot, 'build', 'phase2-before')
  if (existsSync(tree)) sh(`git worktree remove --force "${tree}"`, repoRoot)
  rmSync(tree, { recursive: true, force: true })
  sh(`git worktree add --detach "${tree}" ${ref}`, repoRoot)
  const web = join(tree, 'apps', 'web')
  sh('pnpm install --frozen-lockfile && pnpm run build', web)
  return join(web, 'dist')
}

/** Fresh build of the current tree; returns its dist dir. */
export function buildCurrent() {
  rmSync(join(webRoot, 'dist'), { recursive: true, force: true })
  sh('pnpm run build', webRoot)
  return join(webRoot, 'dist')
}

const TRIPS = [
  { id: 't2', name: 'Kyoto cherry blossom', destination: 'Japan, Kyoto', country: 'Japan', place: 'Kyoto', start_date: '2027-04-02', end_date: '2027-04-09', shared: false, stays: [{ id: 's1' }] },
  { id: 't1', name: 'Lisbon long weekend', destination: 'Portugal, Lisbon', country: 'Portugal', place: 'Lisbon', start_date: '2027-03-03', end_date: '2027-03-06', shared: true, stays: [] },
]
const TRIP = {
  id: 't1',
  name: 'Lisbon long weekend',
  destination: 'Portugal, Lisbon',
  country: 'Portugal',
  place: 'Lisbon',
  start_date: '2027-03-03',
  end_date: '2027-03-06',
  is_owner: true,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
  ],
  options: [],
  activities: [],
  stays: [],
}

/** Page ids to URL path and the trips the mocked API holds while it is shown. */
export const PAGE_SETUP = {
  home: { path: '/', trips: [] },
  'my-trips': { path: '/', trips: TRIPS },
  'trip-planner': { path: '/trips/t1', trips: TRIPS },
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }

/** Serves `dist` with an SPA fallback and the mocked, signed-in API. `getTrips` picks the My trips list. */
export function serve(dist, getTrips) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    // A page navigation asks for HTML; the app's own fetches do not.
    if (!req.headers.accept?.includes('text/html')) {
      if (url.pathname === '/auth/me') return json(200, { email: 'maya@example.com', method: 'email' })
      if (url.pathname === '/trips') return json(200, getTrips())
      if (url.pathname === '/trips/t1') return json(200, TRIP)
      if (/^\/(trips|places|destinations|auth|local|profile)(\/|$)/.test(url.pathname)) return json(404, {})
    }
    const file = join(dist, url.pathname)
    const isFile = file.startsWith(dist) && existsSync(file) && statSync(file).isFile()
    const target = isFile ? file : join(dist, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' })
    res.end(readFileSync(target))
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, origin: `http://127.0.0.1:${server.address().port}` })))
}
