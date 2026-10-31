/** An amount in the traveller's locale, always with the currency code so mixed currencies are never ambiguous. */
export const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)

/** An exchange rate in the traveller's locale, to at most four decimals. */
export const formatRate = (rate: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(rate)
