import { call } from '../trips/api'
import type { TransportCabin, TransportMode } from '../trips/api'

export type TransportOption = {
  id: string
  mode: TransportMode
  title: string
  provider: string
  detail: string
  stops: number
  departs: string | null
  cabin: TransportCabin | null
  price: string
  currency: string
  estimate: boolean
  why: string
  url: string
  preferred_provider: boolean
}

export type TransportOptions = {
  origin: string
  destination: string
  date: string
  options: TransportOption[]
}

/** Search takes the route and date only; the server applies the traveller's saved preferences. */
export const fetchTransportOptions = (origin: string, destination: string, date: string) =>
  call<TransportOptions>(`/transport/options?${new URLSearchParams({ origin, destination, date })}`)
