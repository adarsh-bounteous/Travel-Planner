import { call } from '../trips/api'

export type PlaceType = 'landmark' | 'museum' | 'park' | 'food' | 'shopping'
export type Price = 'free' | 'budget' | 'moderate' | 'premium'
export type Place = {
  id: string
  name: string
  image_url: string
  place_type: PlaceType
  price: Price
  lat: number
  lng: number
}
export type PlaceFilters = { placeType?: PlaceType; price?: Price }

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
    }${filters.price === undefined ? '' : `&price=${filters.price}`}`,
  )

export const fetchSavedPlaces = () => call<Place[]>('/saved-places')

export const savePlace = (place: Place) =>
  call<Place>(`/saved-places/${encodeURIComponent(place.id)}`, 'PUT', place)

export const unsavePlace = (id: string) =>
  call<void>(`/saved-places/${encodeURIComponent(id)}`, 'DELETE')
