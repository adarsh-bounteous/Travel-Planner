import type { PlaceType } from '../places/api'

export type Region = 'europe' | 'asia' | 'americas' | 'africa'

export type IllustrationRef = { destination?: string; country?: string; placeType: PlaceType }

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

/** Destination art first, then its region's art, then the place type's art. */
export function resolveIllustration({ destination, country, placeType }: IllustrationRef): string {
  const destinationKey = destination ? `destination/${destination.trim().toLowerCase()}` : undefined
  if (destinationKey && destinationKey in illustrationLoaders) return destinationKey
  const region = country ? regionOfCountry(country) : undefined
  if (region && `region/${region}` in illustrationLoaders) return `region/${region}`
  return `type/${placeType}`
}
