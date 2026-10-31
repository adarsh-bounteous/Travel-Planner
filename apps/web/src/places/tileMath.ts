import type { Place } from './api'

export type LatLng = { lat: number; lng: number }
export type Tile = { z: number; x: number; y: number }
export type View = { center: LatLng; zoom: number }

export const TILE_SIZE = 256
export const MIN_ZOOM = 0
export const MAX_ZOOM = 19
const FIT_PADDING = 30
const SINGLE_PLACE_ZOOM = 13
const MAX_LAT = 85.0511

const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom
const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))

/** Web Mercator: a position in world pixels at this zoom. */
export function project({ lat, lng }: LatLng, zoom: number) {
  const sin = Math.sin((clampLat(lat) * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * worldSize(zoom),
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize(zoom),
  }
}

export function unproject({ x, y }: { x: number; y: number }, zoom: number): LatLng {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(zoom)
  return { lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI, lng: (x / worldSize(zoom)) * 360 - 180 }
}

/** Only the tiles that intersect the viewport: no margin, no neighbouring zoom level. */
export function visibleTiles(center: LatLng, zoom: number, width: number, height: number): Tile[] {
  const c = project(center, zoom)
  const last = 2 ** zoom - 1
  const range = (from: number, to: number) => [
    Math.max(0, Math.floor(from / TILE_SIZE)),
    Math.min(last, Math.ceil(to / TILE_SIZE) - 1),
  ]
  const [x0, x1] = range(c.x - width / 2, c.x + width / 2)
  const [y0, y1] = range(c.y - height / 2, c.y + height / 2)
  const tiles: Tile[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ z: zoom, x, y })
  return tiles
}

/** The view that shows every place with some padding; one place gets a street-level zoom. */
export function fitView(places: Place[], width: number, height: number): View {
  if (places.length === 0) return { center: { lat: 0, lng: 0 }, zoom: MIN_ZOOM }
  const lats = places.map((p) => p.lat)
  const lngs = places.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const corners = (zoom: number) => [
    project({ lat: maxLat, lng: minLng }, zoom),
    project({ lat: minLat, lng: maxLng }, zoom),
  ]
  let zoom = SINGLE_PLACE_ZOOM
  for (; zoom > MIN_ZOOM; zoom--) {
    const [a, b] = corners(zoom)
    if (b.x - a.x <= width - 2 * FIT_PADDING && b.y - a.y <= height - 2 * FIT_PADDING) break
  }
  const [a, b] = corners(zoom)
  return { center: unproject({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom), zoom }
}
