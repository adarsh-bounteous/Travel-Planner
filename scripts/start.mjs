import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { busyPortMessage, findBusyPorts } from './ports.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'services/api')
const webDir = path.join(root, 'apps/web')
const venvPython = path.join(apiDir, '.venv/bin/python')

function readPort(env, name, fallback) {
  const port = Number(env[name] ?? fallback)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a port number from 1 to 65535, got "${env[name]}".`)
  }
  return port
}

export function buildPlan(env) {
  const apiPort = readPort(env, 'API_PORT', 8000)
  const webPort = readPort(env, 'WEB_PORT', 5173)
  return {
    apiPort,
    webPort,
    api: {
      cmd: venvPython,
      args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)],
      cwd: apiDir,
      env: {
        ...env,
        LOCAL_MODE: 'true',
        APP_ENV: 'local',
        COOKIE_SECURE: 'false',
        WEB_ORIGIN: `http://localhost:${webPort}`,
        SESSION_SECRET: randomBytes(32).toString('hex'),
      },
    },
    web: {
      cmd: 'pnpm',
      args: ['exec', 'vite', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
      cwd: webDir,
      env: { ...env, API_ORIGIN: `http://127.0.0.1:${apiPort}` },
    },
  }
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`"${cmd} ${args.join(' ')}" failed`)
    process.exit(1)
  }
}

function firstRunSetup() {
  if (!existsSync(path.join(webDir, 'node_modules'))) {
    run('pnpm', ['install', '--frozen-lockfile'], webDir)
  }
  if (!existsSync(venvPython)) {
    run('python3', ['-m', 'venv', '.venv'], apiDir)
    run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], apiDir)
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1')
    sock.setTimeout(2000, () => sock.destroy())
    sock.once('connect', () => {
      sock.destroy()
      resolve(true)
    })
    sock.once('error', () => resolve(false))
    sock.once('close', () => resolve(false))
  })
}

async function waitUntil(check, ms = 120000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

async function main() {
  let plan
  try {
    plan = buildPlan(process.env)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
  const busy = await findBusyPorts([
    { name: 'API', port: plan.apiPort },
    { name: 'Web', port: plan.webPort },
  ])
  if (busy.length > 0) {
    console.error(busyPortMessage(busy))
    process.exit(1)
  }

  firstRunSetup()

  const children = [plan.api, plan.web].map((p) =>
    spawn(p.cmd, p.args, { cwd: p.cwd, env: p.env, stdio: 'inherit' }),
  )
  let stopping = false
  const stopAll = (code) => {
    if (stopping) return
    stopping = true
    for (const c of children) c.kill('SIGTERM')
    process.exitCode = code
  }
  for (const c of children) {
    c.once('exit', (code) => stopAll(code || 1))
    c.once('error', (err) => {
      console.error(err.message)
      stopAll(1)
    })
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stopAll(0))

  const apiUp = await waitUntil(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${plan.apiPort}/health`)).ok
    } catch {
      return false
    }
  })
  const webUp = apiUp && (await waitUntil(() => portOpen(plan.webPort)))
  if (!webUp) {
    if (!stopping) {
      console.error('The apps did not become ready in time.')
      stopAll(1)
    }
    return
  }
  console.log(`API: http://127.0.0.1:${plan.apiPort}`)
  console.log(`Web: http://localhost:${plan.webPort}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
