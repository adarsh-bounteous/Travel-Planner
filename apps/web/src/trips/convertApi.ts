import { call } from './api'

/** The currencies the app converts between, as the API's local rate table offers them. */
export const OFFERED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD']

export type Conversion =
  | { supported: true; amount: number; currency: string; rate: number }
  | { supported: false; message: string }

export const convertCost = (amount: number, from: string, to: string) =>
  call<Conversion>(
    `/rates/convert?${new URLSearchParams({ amount: String(amount), from, to })}`,
  )

/** An offered currency's amount with its code: whole units for JPY, two decimals otherwise. */
export function formatConverted(amount: number, currency: string) {
  const digits = currency === 'JPY' ? 0 : 2
  const text = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
  return `${text} ${currency}`
}
