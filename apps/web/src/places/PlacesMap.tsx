import type { Place } from './api'

const WIDTH = 400
const HEIGHT = 300
const PADDING = 30

const PIN_PATH = 'M12 1C6 1 2 5.500 2 11c0 7.500 10 20 10 20s10-12.500 10-20C22 5.500 18 1 12 1z'
const HEART_PATH = 'M12 21s-8-5.500-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 5.500-8 11-8 11z'

/** Linearly scales a value within [min, max] into [start, end]; a single point sits in the middle. */
const scale = (value: number, min: number, max: number, start: number, end: number) =>
  max === min ? (start + end) / 2 : start + ((value - min) / (max - min)) * (end - start)

/** The pin shape from the design: a filled heart pin when saved, an outlined dot pin when not. */
function Pin({ saved }: { saved: boolean }) {
  return saved ? (
    <svg width={36} height={46} viewBox="0 0 24 32" x={-18} y={-46} aria-hidden="true">
      <path d={PIN_PATH} fill="var(--color-primary)" stroke="var(--color-primary-hover)" />
      <path
        d={HEART_PATH}
        transform="translate(6.500 5.500) scale(0.45)"
        fill="var(--color-on-primary)"
      />
    </svg>
  ) : (
    <svg width={28} height={36} viewBox="0 0 24 32" x={-14} y={-36} aria-hidden="true">
      <path d={PIN_PATH} fill="var(--color-bg)" stroke="var(--color-border-strong)" />
      <circle cx={12} cy={11} r={3.5} fill="var(--color-border-strong)" />
    </svg>
  )
}

function LegendItem({ saved }: { saved: boolean }) {
  return (
    <span className="cluster" style={{ gap: 'var(--space-1)' }}>
      <svg width={20} height={26} viewBox="0 0 24 32" aria-hidden="true">
        {saved ? (
          <>
            <path d={PIN_PATH} fill="var(--color-primary)" stroke="var(--color-primary-hover)" />
            <path
              d={HEART_PATH}
              transform="translate(6.500 5.500) scale(0.45)"
              fill="var(--color-on-primary)"
            />
          </>
        ) : (
          <>
            <path d={PIN_PATH} fill="var(--color-bg)" stroke="var(--color-border-strong)" />
            <circle cx={12} cy={11} r={3.5} fill="var(--color-border-strong)" />
          </>
        )}
      </svg>
      {saved ? 'Saved place' : 'Not saved'}
    </span>
  )
}

type PlacesMapProps = {
  places: Place[]
  /** Ids of saved places, which get the heart pin. Without it every place is shown as saved or not as given. */
  savedIds?: Set<string>
  ariaLabel?: string
  /** The Saved page only has saved places, so its legend lists just those. */
  onlySaved?: boolean
}

export function PlacesMap({
  places,
  savedIds = new Set(),
  ariaLabel = 'Map of places',
  onlySaved = false,
}: PlacesMapProps) {
  const lats = places.map((p) => p.lat)
  const lngs = places.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]

  return (
    <div
      className="card"
      style={{
        position: 'relative',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        className="cluster"
        style={{
          position: 'absolute',
          top: 'var(--space-2)',
          left: 'var(--space-2)',
          zIndex: 2,
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--color-bg)',
          border: 'var(--border-width) solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        <LegendItem saved />
        {!onlySaved && <LegendItem saved={false} />}
      </div>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: '100%', height: 'auto' }}
      >
        {places.map((place) => {
          const x = scale(place.lng, minLng, maxLng, PADDING, WIDTH - PADDING)
          const y = scale(place.lat, minLat, maxLat, HEIGHT - PADDING, PADDING)
          const saved = onlySaved || savedIds.has(place.id)
          return (
            <g
              key={place.id}
              role="listitem"
              aria-label={`${place.name}, ${saved ? 'saved' : 'not saved'}`}
              data-saved={saved}
              transform={`translate(${x} ${y})`}
            >
              <title>{place.name}</title>
              <Pin saved={saved} />
              <text y={8 + 12} textAnchor="middle" fontSize={12} fill="var(--color-fg)">
                {place.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
