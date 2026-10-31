import { call, ForbiddenError, NotFoundError, UnauthorizedError } from '../trips/api'

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

export type ProviderStatus = { name: string; kind: string; health: string }

/** Thrown when the API refuses the provider list: 401 when not signed in, 403 for no access. */
export class ProvidersNotAllowedError extends Error {}

/** Thrown when local mode is off (404): there is no provider list to show yet. */
export class ProvidersUnavailableError extends Error {}

export async function fetchProviderStatuses(): Promise<ProviderStatus[]> {
  try {
    return (await call<{ providers: ProviderStatus[] }>('/providers/status')).providers
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) throw new ProvidersNotAllowedError()
    if (error instanceof NotFoundError) throw new ProvidersUnavailableError()
    throw error
  }
}

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
