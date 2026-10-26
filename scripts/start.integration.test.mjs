import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { test } from 'node:test'
import { isPortFree } from './ports.mjs'

const script = new URL('./start.mjs', import.meta.url).pathname

function listen() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, '127.0.0.1', () => resolve(srv))
  })
}

async function freePort() {
  const srv = await listen()
  const { port } = srv.address()
  await new Promise((r) => srv.close(r))
  return port
}

for (const busyName of ['API', 'Web']) {
  test(`busy ${busyName} port: exit 1, names the port, nothing started`, async () => {
    const srv = await listen()
    const busy = srv.address().port
    const other = await freePort()
    const apiBusy = busyName === 'API'
    const env = {
      ...process.env,
      API_PORT: String(apiBusy ? busy : other),
      WEB_PORT: String(apiBusy ? other : busy),
    }
    const result = spawnSync('node', [script], { env, encoding: 'utf8', timeout: 20000 })
    assert.equal(result.status, 1)
    assert.match(result.stderr, new RegExp(`Port ${busy}`))
    assert.equal(await isPortFree(other), true)
    srv.close()
  })
}

async function waitFor(url, ms = 90000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(url)
      if (r.status === 200) return r
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timed out waiting for ${url}`)
}

test('real start: both apps up, wired, and sign-in survives a reload', async () => {
  const apiPort = await freePort()
  const webPort = await freePort()
  const child = spawn('node', [script], {
    env: { ...process.env, API_PORT: String(apiPort), WEB_PORT: String(webPort) },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  const web = `http://127.0.0.1:${webPort}`
  try {
    await waitFor(`${web}/health`)
    const end = Date.now() + 30000
    while (!output.includes('Web:') && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 200))
    }
    assert.match(output, new RegExp(`API: http://127.0.0.1:${apiPort}`))
    assert.match(output, new RegExp(`Web: http://localhost:${webPort}`))
    const root = await fetch(web, { headers: { accept: 'text/html' } })
    assert.match(await root.text(), /<html/i)

    const status = await (await fetch(`${web}/startup-status`)).json()
    assert.equal(status.local_mode, true)
    assert.ok(status.demo_account)

    const signIn = await fetch(`${web}/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(status.demo_account),
    })
    const cookie = signIn.headers.get('set-cookie')
    assert.match(cookie, /session=/)
    assert.doesNotMatch(cookie, /;\s*secure/i)
    const me = await fetch(`${web}/auth/me`, { headers: { cookie: cookie.split(';')[0] } })
    assert.equal(me.status, 200)
  } finally {
    child.kill('SIGTERM')
    await new Promise((r) => child.once('exit', r))
  }
})
