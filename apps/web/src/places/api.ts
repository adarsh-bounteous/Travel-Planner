import { call } from '../trips/api'

export type PlaceType = 'landmark' | 'museum' | 'park' | 'food' | 'shopping'
export type Price = 'free' | 'budget' | 'moderate' | 'premium'
export type Place = {
  id: string
  name: string
  image_url: string
  place_type: PlaceType
  price: Price | null
  lat: number
  lng: number
  category?: Category | null
  address?: string | null
  opening_hours?: string | null
  source?: 'seed' | 'osm'
  as_of?: string | null
  provider_id?: string | null
  url?: string | null
}
export type Category = 'sights' | 'food' | 'museums' | 'viewpoints' | 'nightlife'
export type PlaceFilters = { placeType?: PlaceType; price?: Price; category?: Category }

export const PLACE_CATEGORY_LABELS: Record<Category, string> = {
  sights: 'Sights',
  food: 'Food',
  museums: 'Museums',
  viewpoints: 'Viewpoints',
  nightlife: 'Nightlife',
}

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  landmark: 'Landmark',
  museum: 'Museum',
  park: 'Park',
  food: 'Food',
  shopping: 'Shopping',
}

export const PRICE_LABELS: Record<Price, string> = {
  free: 'Free',
  budget: 'Budget',
  moderate: 'Moderate',
  premium: 'Premium',
}

export const searchPlaces = (destination: string, q?: string, filters: PlaceFilters = {}) =>
  call<Place[]>(
    `/places?destination=${encodeURIComponent(destination)}${q === undefined ? '' : `&q=${encodeURIComponent(q)}`}${
      filters.placeType === undefined ? '' : `&place_type=${filters.placeType}`
    }${filters.price === undefined ? '' : `&price=${filters.price}`}${
      filters.category === undefined ? '' : `&category=${filters.category}`
    }`,
  )

/** Whether the map shows real tiles; false when the API says no, or when the call fails. */
export async function fetchMapTiles(): Promise<boolean> {
  try {
    const response = await fetch('/startup-status', { credentials: 'same-origin' })
    if (!response.ok) return false
    const body = await response.json()
    return body.map_tiles === true
  } catch {
    return false
  }
}

export const fetchSavedPlaces = () => call<Place[]>('/saved-places')

export const savePlace = (place: Place) =>
  call<Place>(`/saved-places/${encodeURIComponent(place.id)}`, 'PUT', place)

export const unsavePlace = (id: string) =>
  call<void>(`/saved-places/${encodeURIComponent(id)}`, 'DELETE')
