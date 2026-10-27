// Money and dates for the currency and weather helpers. The code always comes before the number.

// Mirrors the API's WHOLE_UNIT_CURRENCIES.
const WHOLE_UNIT_CURRENCIES = ['JPY']

export const decimalsFor = (currency: string): number => (WHOLE_UNIT_CURRENCIES.includes(currency) ? 0 : 2)

export const formatNumber = (amount: number, currency: string): string =>
  amount.toLocaleString(undefined, {
    minimumFractionDigits: decimalsFor(currency),
    maximumFractionDigits: decimalsFor(currency),
  })

export const formatMoney = (amount: number, currency: string): string =>
  `${currency} ${formatNumber(amount, currency)}`

export const formatRate = (rate: number, from: string, to: string): string =>
  `${from} 1 = ${to} ${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })}`

export const formatDate = (date: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export const formatTripDates = (start?: string | null, end?: string | null): string =>
  [start, end]
    .filter((d): d is string => Boolean(d))
    .map(formatDate)
    .join(' – ')

/** Digits with optional thousands separators and a decimal point; null for anything else. */
export const parseAmount = (text: string): number | null => {
  const plain = text.replace(/,/g, '').trim()
  return /^(\d+\.?\d*|\.\d+)$/.test(plain) ? Number(plain) : null
}

export const convertAmount = (
  amount: number,
  rate: number,
  direction: 'toHome' | 'toDestination',
): number => (direction === 'toHome' ? amount * rate : amount / rate)

export const currencyName = (code: string): string => {
  try {
    const name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(code)
    return name ? `${code} (${name.toLowerCase()})` : code
  } catch {
    return code
  }
}
