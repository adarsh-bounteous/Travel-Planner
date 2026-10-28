import { call } from '../trips/api'

export type StarterCountry = { name: string; places: string[] }
export type SampleItem = { name: string; note: string }
export type SampleStay = SampleItem & { price_per_night: number; currency: string }
export type StarterPlaceContent = {
  name: string
  places: SampleItem[]
  restaurants: SampleItem[]
  stays: SampleStay[]
  activities: SampleItem[]
  medical_guidance: string
}

export const fetchStarterDestinations = () => call<StarterCountry[]>('/starter-destinations')

export const fetchStarterPlace = (country: string, place: string) =>
  call<StarterPlaceContent>(
    `/starter-destinations/${encodeURIComponent(country)}/${encodeURIComponent(place)}`,
  )
