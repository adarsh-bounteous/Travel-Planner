import { call } from '../trips/api'

export type TravelKind = 'stay' | 'flight' | 'transport'

export type TravelOption = {
  id: string
  name: string
  detail: string
  price: string
  currency: string
  unit: 'total' | 'per traveller'
  url: string
}

export type TravelSearchResult = {
  kind: TravelKind
  source: 'local' | 'provider'
  matched: boolean
  options: TravelOption[]
}

export type BookingPreview = {
  option: TravelOption
  kind: TravelKind
  place: string
  number: number
  start: string
  end: string
}

export type TravelSearchParams = {
  type: TravelKind
  destination: string
  depart: string
  return: string
  route: string
}

/** A 422 (ValidationError) means the return date is before the departure. */
export const searchTravel = (params: TravelSearchParams) =>
  call<TravelSearchResult>(`/travel-search?${new URLSearchParams(params)}`)

export const fetchBookingPreview = (ref: string) =>
  call<BookingPreview>(`/travel-search/booking?${new URLSearchParams({ ref })}`)

export const fetchLocalMode = () => call<{ local_mode: boolean }>('/local/mode')

/** Thrown when a live deployment refuses to turn local mode on (409). */
export class LocalModeNotAllowedError extends Error {}

export async function setLocalMode(on: boolean): Promise<{ local_mode: boolean }> {
  const response = await fetch('/local/mode', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
  })
  if (response.status === 409) throw new LocalModeNotAllowedError()
  if (!response.ok) throw new Error(`request failed: ${response.status}`)
  return response.json()
}
