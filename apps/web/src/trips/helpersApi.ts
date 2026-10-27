import { call } from './api'

export type CurrencyHelper = {
  destination_currency: string | null
  home_currency: string
  live: { rate: string; inverse: string; as_of: string } | null
  last_known: { rate: string; as_of: string } | null
  start_date: string | null
  end_date: string | null
}

export type TypicalWeather = {
  month: number
  summary: string
  high_c: number
  low_c: number
  rain_mm: number
  rain_days: number
  as_of: string
}

export type DayForecast = { date: string; high_c: number; low_c: number; rain_percent: number }

export type WeatherHelper = {
  typical: TypicalWeather | null
  forecast: { status: 'available' | 'unavailable'; days: DayForecast[] } | null
  start_date: string | null
  end_date: string | null
}

export const fetchCurrencyHelper = (tripId: string) =>
  call<CurrencyHelper>(`/trips/${encodeURIComponent(tripId)}/currency-helper`)

export const fetchWeatherHelper = (tripId: string) =>
  call<WeatherHelper>(`/trips/${encodeURIComponent(tripId)}/weather-helper`)
