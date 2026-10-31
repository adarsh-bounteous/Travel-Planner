import type { PlaceType } from '../places/api'

export type Region = 'europe' | 'asia' | 'americas' | 'africa'

export type IllustrationRef = { destination?: string; country?: string; placeType?: PlaceType }

const FOLDERS: Record<string, string> = {
  lisbon: 'destination',
  tokyo: 'destination',
  europe: 'region',
  asia: 'region',
  landmark: 'type',
  museum: 'type',
  park: 'type',
  food: 'type',
  shopping: 'type',
  generic: 'generic',
}

// Lazy glob: each SVG becomes its own on-demand chunk, so no art URL or data URI lands in the main bundle.
const modules = import.meta.glob<string>('./art/*.svg', { query: '?url', import: 'default' })

/** Illustration key (e.g. 'destination/lisbon') to a loader that fetches its URL on demand. */
export const illustrationLoaders: Record<string, () => Promise<string>> = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => {
    const name = path.replace('./art/', '').replace('.svg', '')
    return [`${FOLDERS[name]}/${name}`, load]
  }),
)

const REGION_OF_COUNTRY: Record<string, Region> = {
  Japan: 'asia',
  India: 'asia',
  Thailand: 'asia',
  Portugal: 'europe',
  Mexico: 'americas',
  Peru: 'americas',
  Morocco: 'africa',
}

export function regionOfCountry(country: string): Region | undefined {
  return REGION_OF_COUNTRY[country]
}

/** Destination art first, then its region's art, then the place type's art, then the neutral generic art. */
export function resolveIllustration({ destination, country, placeType }: IllustrationRef): string {
  const destinationKey = destination ? `destination/${destination.trim().toLowerCase()}` : undefined
  if (destinationKey && destinationKey in illustrationLoaders) return destinationKey
  const region = country ? regionOfCountry(country) : undefined
  if (region && `region/${region}` in illustrationLoaders) return `region/${region}`
  if (placeType && `type/${placeType}` in illustrationLoaders) return `type/${placeType}`
  return 'generic/generic'
}

/** Alt text for art that carries meaning (hero, cover): names the destination, else describes the neutral art. */
export function illustrationAlt(ref: IllustrationRef, subject?: string): string {
  const key = resolveIllustration(ref)
  if (key.startsWith('destination/')) return `Illustration of ${subject ?? ref.destination}`
  return 'Neutral illustration of hills and a sun'
}

/** A trip's art: its chosen place and country when it has them, else its free-text destination label. */
export function illustrationRefOfTrip(trip: {
  place?: string | null
  country?: string | null
  destination?: string | null
}): IllustrationRef {
  if (trip.place) return { destination: trip.place, country: trip.country ?? undefined }
  return illustrationRefOfLabel(trip.destination)
}

/** Reads a trip label such as "Portugal, Lisbon" (either order) into the destination and country parts. */
export function illustrationRefOfLabel(label: string | null | undefined): IllustrationRef {
  const parts = (label ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const destination =
    parts.find((p) => `destination/${p.toLowerCase()}` in illustrationLoaders) ?? parts[parts.length - 1]
  return { destination, country: parts.find((p) => regionOfCountry(p)) }
}
