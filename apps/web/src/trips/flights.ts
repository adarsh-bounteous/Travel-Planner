import type { TransportLeg, TransportMode, TransportPick } from './api'

export const formatMinutes = (m: number) => {
  if (m < 60) return `${m} min`
  const rest = m % 60
  return `${Math.floor(m / 60)} h${rest ? ` ${rest} min` : ''}`
}

const MODE_LABELS: Record<TransportMode, string> = { flight: 'Flight', train: 'Train', bus: 'Bus', taxi: 'Taxi' }

export const formatMode = (mode: TransportMode) => MODE_LABELS[mode]

export const formatStops =(stops: number) =>
  stops === 0 ? 'Nonstop' : stops === 1 ? '1 stop' : `${stops} stops`

/** A fare with cents and its currency, in the traveller's local format. */
export const formatFare = (amount: string | number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amount))

export const LEGS: TransportLeg[] = ['destination', 'between_cities', 'local_taxi']

export const legName = (leg: TransportLeg, destination: string) =>
  leg === 'destination'
    ? `To and from ${destination}`
    : leg === 'between_cities'
      ? 'Between cities'
      : `Local taxi in ${destination}`

/** "Flight · Atlantic Air · €180.00"; a taxi fare is an estimate. */
export const pickSummary = (pick: TransportPick) =>
  `${MODE_LABELS[pick.mode]} · ${pick.provider} · ${pick.estimate ? 'Estimate ' : ''}${formatFare(pick.fare, pick.currency)}`

export const formatRetrieved =(iso: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  )

/** "2027-11-18" as "18 Nov", read as a calendar day so no time zone moves it. */
export const formatLegDate = (isoDate: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )
