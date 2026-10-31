import type { Place } from './api'
import { TILE_SIZE, fitView, project, unproject, visibleTiles } from './tileMath'

const center = { lat: 38.72, lng: -9.14 }

const intersects = (t: { x: number; y: number }, z: number, w: number, h: number) => {
  const p = project(center, z)
  const [left, right, top, bottom] = [p.x - w / 2, p.x + w / 2, p.y - h / 2, p.y + h / 2]
  return (
    t.x * TILE_SIZE < right &&
    (t.x + 1) * TILE_SIZE > left &&
    t.y * TILE_SIZE < bottom &&
    (t.y + 1) * TILE_SIZE > top
  )
}

describe('tile maths', () => {
  it('requests only tiles that intersect the viewport (AC6, AC7)', () => {
    const tiles = visibleTiles(center, 12, 400, 300)
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThanOrEqual(6)
    for (const t of tiles) {
      expect(t.z).toBe(12)
      expect(intersects(t, 12, 400, 300)).toBe(true)
    }
  })

  it('never asks for tiles outside the world', () => {
    for (const t of visibleTiles({ lat: 0, lng: 0 }, 0, 400, 300)) {
      expect(t).toEqual({ z: 0, x: 0, y: 0 })
    }
  })

  it('unproject reverses project', () => {
    const back = unproject(project(center, 10), 10)
    expect(back.lat).toBeCloseTo(center.lat, 6)
    expect(back.lng).toBeCloseTo(center.lng, 6)
  })

  it('fitView puts every place inside the viewport', () => {
    const places = [
      { lat: 38.711, lng: -9.13 },
      { lat: 38.6916, lng: -9.216 },
    ] as Place[]
    const view = fitView(places, 400, 300)
    const c = project(view.center, view.zoom)
    for (const p of places) {
      const o = project(p, view.zoom)
      expect(Math.abs(o.x - c.x)).toBeLessThanOrEqual(200)
      expect(Math.abs(o.y - c.y)).toBeLessThanOrEqual(150)
    }
  })
})
