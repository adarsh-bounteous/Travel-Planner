export const formatMinutes = (m: number) => {
  if (m < 60) return `${m} min`
  const rest = m % 60
  return `${Math.floor(m / 60)} h${rest ? ` ${rest} min` : ''}`
}

export const formatStops = (stops: number) =>
  stops === 0 ? 'Nonstop' : stops === 1 ? '1 stop' : `${stops} stops`

/** A fare with cents and its currency, in the traveller's local format. */
export const formatFare = (amount: string | number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amount))

export const formatRetrieved = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  )

/** "2027-11-18" as "18 Nov", read as a calendar day so no time zone moves it. */
export const formatLegDate = (isoDate: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )
