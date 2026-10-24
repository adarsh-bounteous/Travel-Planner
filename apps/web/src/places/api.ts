import { call } from '../trips/api'

export type Place = { id: string; name: string; image_url: string }

export const searchPlaces = (destination: string, q?: string) =>
  call<Place[]>(
    `/places?destination=${encodeURIComponent(destination)}${q === undefined ? '' : `&q=${encodeURIComponent(q)}`}`,
  )
