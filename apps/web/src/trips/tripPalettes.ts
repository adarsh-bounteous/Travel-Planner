import type { CSSProperties } from 'react'
import { illustrationRefOfTrip } from '../illustrations/registry'

export type PaletteName = 'lisbon' | 'kyoto' | 'marrakech' | 'paris' | 'neutral'

/**
 * One fixed colour set per seeded destination, plus a neutral default.
 * hero: solid panel behind white hero text. accent: underline, borders and art (3:1 on white).
 * subtle: tint. ink: accent text on white or on the tint. sky, sun, deep: illustration fills.
 * The colour literals live here, not in index.css, which is held to tokens only.
 * None of them is --color-primary, which stays reserved for actions.
 */
export type Palette = {
  name: PaletteName
  label: string
  hero: string
  accent: string
  subtle: string
  ink: string
  sky: string
  sun: string
  deep: string
}

export const PALETTES: Record<PaletteName, Palette> = {
  lisbon: {
    name: 'lisbon',
    label: 'Lisbon tile blues',
    hero: '#1e3a8a',
    accent: '#3b5fc0',
    subtle: '#eaf0fb',
    ink: '#1e3a8a',
    sky: '#cfdcf6',
    sun: '#f2c230',
    deep: '#16296b',
  },
  kyoto: {
    name: 'kyoto',
    label: 'Kyoto lacquer reds',
    hero: '#9f1d20',
    accent: '#b4232a',
    subtle: '#fbeceb',
    ink: '#7f1519',
    sky: '#f6d9d6',
    sun: '#f3e3bf',
    deep: '#6e1013',
  },
  marrakech: {
    name: 'marrakech',
    label: 'Marrakech terracotta',
    hero: '#8c3f14',
    accent: '#b45309',
    subtle: '#fdf1e3',
    ink: '#6e300f',
    sky: '#f8dcb8',
    sun: '#e9a23b',
    deep: '#5c2a0d',
  },
  paris: {
    name: 'paris',
    label: 'Paris dusk plum',
    hero: '#4a3f6b',
    accent: '#6d4fa3',
    subtle: '#f1edf8',
    ink: '#46336f',
    sky: '#ddd3ee',
    sun: '#f1d98a',
    deep: '#30284a',
  },
  neutral: {
    name: 'neutral',
    label: 'Neutral slate',
    hero: 'var(--color-fg-muted)',
    accent: 'var(--color-border-strong)',
    subtle: 'var(--color-surface)',
    ink: 'var(--color-fg)',
    sky: 'var(--color-border)',
    sun: 'var(--color-skeleton)',
    deep: 'var(--color-fg)',
  },
}

export function paletteForDestination(destination: string | undefined): Palette {
  const key = (destination ?? '').trim().toLowerCase()
  return Object.hasOwn(PALETTES, key) && key !== 'neutral' ? PALETTES[key as PaletteName] : PALETTES.neutral
}

export function paletteForTrip(trip: {
  place?: string | null
  country?: string | null
  destination?: string | null
}): Palette {
  return paletteForDestination(illustrationRefOfTrip(trip).destination)
}

export function paletteStyle(p: Palette): CSSProperties {
  return {
    '--pal-hero': p.hero,
    '--pal-accent': p.accent,
    '--pal-subtle': p.subtle,
    '--pal-ink': p.ink,
    '--pal-sky': p.sky,
    '--pal-sun': p.sun,
    '--pal-deep': p.deep,
  } as CSSProperties
}
