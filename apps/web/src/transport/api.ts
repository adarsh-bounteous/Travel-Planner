import { call } from '../trips/api'
import type { TransportMode } from '../trips/api'

export type TransportOption = {
  id: string
  mode: TransportMode
  title: string
  provider: string
  detail: string
  stops: number
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

/** The saved preferences are applied by the server; the search sends only the route and date. */
export const fetchTransportOptions = (origin: string, destination: string, date: string) =>
  call<TransportOptions>(`/transport/options?${new URLSearchParams({ origin, destination, date })}`)
