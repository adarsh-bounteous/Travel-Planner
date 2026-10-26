import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPlan } from './start.mjs'

test('plan wires both apps together', () => {
  const p = buildPlan({ API_PORT: '9100', WEB_PORT: '9200' })
  assert.deepEqual(p.api.args.slice(-2), ['--port', '9100'])
  assert.equal(p.api.env.LOCAL_MODE, 'true')
  assert.equal(p.api.env.APP_ENV, 'local')
  assert.equal(p.api.env.COOKIE_SECURE, 'false')
  assert.equal(p.api.env.WEB_ORIGIN, 'http://localhost:9200')
  assert.equal(p.web.env.API_ORIGIN, 'http://127.0.0.1:9100')
  assert.ok(p.web.args.includes('--strictPort'))
})

test('defaults and per-start secret', () => {
  const p = buildPlan({})
  assert.equal(p.apiPort, 8000)
  assert.equal(p.webPort, 5173)
  assert.notEqual(p.api.env.SESSION_SECRET, buildPlan({}).api.env.SESSION_SECRET)
})
