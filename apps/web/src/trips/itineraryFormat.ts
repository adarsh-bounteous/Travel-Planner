/** An ISO calendar date read as that day in the traveller's own time zone. */
export const localDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const formatDay = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(localDate(iso))

export const formatRange = (start: string, end: string) => {
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const year = new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(localDate(end))
  return `${format.format(localDate(start))} – ${format.format(localDate(end))} ${year}`
}

/** A full date with its year, for notes such as a rate date. */
export const formatFullDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(localDate(iso))

/** An exchange rate in the traveller's locale, to at most four decimals. */
export const formatRate = (rate: string) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(Number(rate))

/** An amount in the traveller's locale, always with the currency code. Amounts arrive as decimal strings. */
export const formatMoney = (amount: string, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code' }).format(Number(amount))
