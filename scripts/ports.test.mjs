import assert from 'node:assert/strict'
import net from 'node:net'
import { test } from 'node:test'
import { busyPortMessage, findBusyPorts, isPortFree } from './ports.mjs'

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

test('a port with a listener is not free', async () => {
  const srv = await listen()
  const { port } = srv.address()
  assert.equal(await isPortFree(port), false)
  srv.close()
})

test('findBusyPorts reports every busy port and only those', async () => {
  const srv = await listen()
  const { port } = srv.address()
  const free = await freePort()
  assert.deepEqual(await findBusyPorts([{ name: 'API', port }, { name: 'Web', port: free }]), [
    { name: 'API', port },
  ])
  srv.close()
})

test('message names the busy port', () => {
  const msg = busyPortMessage([{ name: 'API', port: 8000 }])
  assert.match(msg, /Port 8000 \(API\) is already in use/)
  assert.match(msg, /API_PORT/)
})
