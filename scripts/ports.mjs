import net from 'node:net'

export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, host, () => srv.close(() => resolve(true)))
  })
}

export async function findBusyPorts(ports) {
  const free = await Promise.all(ports.map(({ port }) => isPortFree(port)))
  return ports.filter((_, i) => !free[i])
}

export function busyPortMessage(busy) {
  return busy
    .map(
      ({ name, port }) =>
        `Port ${port} (${name}) is already in use. Stop whatever is using it, or set ${name.toUpperCase()}_PORT to another port.`,
    )
    .join('\n')
}
