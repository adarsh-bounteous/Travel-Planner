import type { Place } from './api'

const WIDTH = 400
const HEIGHT = 300
const PADDING = 30

/** Linearly scales a value within [min, max] into [start, end]; a single point sits in the middle. */
const scale = (value: number, min: number, max: number, start: number, end: number) =>
  max === min ? (start + end) / 2 : start + ((value - min) / (max - min)) * (end - start)

export function PlacesMap({ places }: { places: Place[] }) {
  const lats = places.map((p) => p.lat)
  const lngs = places.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]

  return (
    <div className="card" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
      <svg
        role="img"
        aria-label="Map of places"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: '100%', height: 'auto' }}
      >
        {places.map((place) => {
          const x = scale(place.lng, minLng, maxLng, PADDING, WIDTH - PADDING)
          const y = scale(place.lat, minLat, maxLat, HEIGHT - PADDING, PADDING)
          return (
            <g key={place.id} role="listitem" aria-label={place.name}>
              <title>{place.name}</title>
              <circle cx={x} cy={y} r={8} fill="var(--color-primary)" />
              <text x={x} y={y - 14} textAnchor="middle" fontSize={12} fill="var(--color-fg)">
                {place.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
