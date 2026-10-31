import { useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { MinusIcon, PlusIcon } from '../auth/icons'
import type { Place } from './api'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_SIZE,
  fitView,
  project,
  unproject,
  visibleTiles,
  type View,
} from './tileMath'
import { useMapTiles } from './useMapTiles'

const WIDTH = 400
const HEIGHT = 300
const PADDING = 30

const PIN_PATH = 'M12 1C6 1 2 5.500 2 11c0 7.500 10 20 10 20s10-12.500 10-20C22 5.500 18 1 12 1z'
const HEART_PATH = 'M12 21s-8-5.500-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 5.500-8 11-8 11z'

/** Linearly scales a value within [min, max] into [start, end]; a single point sits in the middle. */
const scale = (value: number, min: number, max: number, start: number, end: number) =>
  max === min ? (start + end) / 2 : start + ((value - min) / (max - min)) * (end - start)

/** The pin shape from the design: a filled heart pin when saved, an outlined dot pin when not. */
function PinShape({ saved }: { saved: boolean }) {
  return saved ? (
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
  )
}

/** A pin whose tip sits at the origin of the surrounding `<g>`; saved pins are larger. */
function Pin({ saved }: { saved: boolean }) {
  const [width, height] = saved ? [36, 46] : [28, 36]
  return (
    <svg width={width} height={height} viewBox="0 0 24 32" x={-width / 2} y={-height} aria-hidden="true">
      <PinShape saved={saved} />
    </svg>
  )
}

function LegendItem({ saved }: { saved: boolean }) {
  return (
    <span className="cluster" style={{ gap: 'var(--space-1)' }}>
      <svg width={20} height={26} viewBox="0 0 24 32" aria-hidden="true">
        <PinShape saved={saved} />
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

function Marker({ place, x, y, saved }: { place: Place; x: number; y: number; saved: boolean }) {
  return (
    <g
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
}

const overlayStyle = {
  position: 'absolute',
  zIndex: 2,
  padding: 'var(--space-1) var(--space-2)',
  background: 'var(--color-bg)',
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--font-size-sm)',
} as const

type Drag = { clientX: number; clientY: number; worldX: number; worldY: number }

/** Real OpenStreetMap tiles under the pins: only the tiles in view are requested, with pan and zoom. */
function TileLayerSvg({
  places,
  ariaLabel,
  isSaved,
  zoomControls,
}: {
  places: Place[]
  ariaLabel: string
  isSaved: (place: Place) => boolean
  zoomControls: (controls: ReactNode) => ReactNode
}) {
  const [view, setView] = useState<View>(() => fitView(places, WIDTH, HEIGHT))
  const drag = useRef<Drag | null>(null)
  const origin = project(view.center, view.zoom)
  const [left, top] = [origin.x - WIDTH / 2, origin.y - HEIGHT / 2]

  const zoomBy = (step: number) =>
    setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom + step)) }))
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { clientX: e.clientX, clientY: e.clientY, worldX: origin.x, worldY: origin.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start) return
    const width = e.currentTarget.getBoundingClientRect().width
    const ratio = width > 0 ? WIDTH / width : 1 // screen pixels to viewBox units
    const world = {
      x: start.worldX - (e.clientX - start.clientX) * ratio,
      y: start.worldY - (e.clientY - start.clientY) * ratio,
    }
    setView((v) => ({ ...v, center: unproject(world, v.zoom) }))
  }
  const endDrag = () => {
    drag.current = null
  }

  return (
    <>
      {zoomControls(
        <div className="cluster" style={{ gap: 'var(--space-1)' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomBy(1)}>
            <PlusIcon />
            Zoom in
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomBy(-1)}>
            <MinusIcon />
            Zoom out
          </button>
        </div>,
      )}
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {visibleTiles(view.center, view.zoom, WIDTH, HEIGHT).map((t) => (
          <image
            key={`${t.z}/${t.x}/${t.y}`}
            data-testid="map-tile"
            href={`/places/tiles/${t.z}/${t.x}/${t.y}.png`}
            x={t.x * TILE_SIZE - left}
            y={t.y * TILE_SIZE - top}
            width={TILE_SIZE}
            height={TILE_SIZE}
          />
        ))}
        {places.map((place) => {
          const p = project(place, view.zoom)
          return (
            <Marker
              key={place.id}
              place={place}
              x={p.x - left}
              y={p.y - top}
              saved={isSaved(place)}
            />
          )
        })}
      </svg>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...overlayStyle, right: 'var(--space-2)', bottom: 'var(--space-2)', color: 'var(--color-fg)' }}
      >
        © OpenStreetMap contributors
      </a>
    </>
  )
}

export function PlacesMap({
  places,
  savedIds = new Set(),
  ariaLabel = 'Map of places',
  onlySaved = false,
}: PlacesMapProps) {
  const tilesOn = useMapTiles()
  const lats = places.map((p) => p.lat)
  const lngs = places.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const isSaved = (place: Place) => onlySaved || savedIds.has(place.id)

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
      {tilesOn ? (
        <TileLayerSvg
          key={places.map((p) => p.id).join(',')} // a new set of places refits the view
          places={places}
          ariaLabel={ariaLabel}
          isSaved={isSaved}
          zoomControls={(controls) => (
            <div style={{ ...overlayStyle, top: 'var(--space-2)', right: 'var(--space-2)' }}>
              {controls}
            </div>
          )}
        />
      ) : (
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ width: '100%', height: 'auto' }}
        >
          {places.map((place) => (
            <Marker
              key={place.id}
              place={place}
              x={scale(place.lng, minLng, maxLng, PADDING, WIDTH - PADDING)}
              y={scale(place.lat, minLat, maxLat, HEIGHT - PADDING, PADDING)}
              saved={isSaved(place)}
            />
          ))}
        </svg>
      )}
    </div>
  )
}
