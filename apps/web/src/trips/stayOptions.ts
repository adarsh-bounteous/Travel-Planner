import type { Amenity, PropertyType, StayCriteria } from './api'

export const AMENITIES: { id: Amenity; label: string }[] = [
  { id: 'wifi', label: 'Free Wi-Fi' },
  { id: 'breakfast', label: 'Breakfast included' },
  { id: 'parking', label: 'Parking' },
  { id: 'pool', label: 'Pool' },
  { id: 'ac', label: 'Air conditioning' },
]

export const PROPERTY_TYPES: { id: PropertyType; label: string }[] = [
  { id: 'hotel', label: 'Hotel' },
  { id: 'homestay', label: 'Homestay' },
  { id: 'other', label: 'Other accommodation' },
]

export const STAR_RATINGS = [1, 2, 3, 4, 5]
export const ROOM_COUNTS = [1, 2, 3, 4]

export const DEFAULT_CRITERIA: StayCriteria = {
  property_type: 'hotel',
  rooms: 1,
  max_price: null,
  location: '',
  amenities: [],
  stars: [],
  widen: false,
}

const amenityLabel = (id: Amenity) => AMENITIES.find((a) => a.id === id)?.label ?? id
const typeLabel = (id: PropertyType) => PROPERTY_TYPES.find((t) => t.id === id)?.label ?? id
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export const starsLabel = (n: number) => plural(n, 'star', 'stars')

export function formatMoney(amount: string | number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    Number(amount),
  )
}

export const formatFetched = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  )

/** The no-match detail line, naming what was searched: "Hotel, 1 room, pool, 5 stars in Lisbon." */
export function describeCriteria(c: StayCriteria, place: string, currency = 'EUR') {
  const bits = [typeLabel(c.property_type), plural(c.rooms, 'room', 'rooms')]
  if (c.max_price !== null) bits.push(`up to ${formatMoney(c.max_price, currency)} a night`)
  if (c.location.trim() !== '') bits.push(`near ${c.location.trim()}`)
  c.amenities.forEach((a) => bits.push(amenityLabel(a).toLowerCase().replace('wi-fi', 'Wi-Fi')))
  if (c.stars.length > 0) bits.push(c.stars.map(starsLabel).join(' or '))
  return `${bits.join(', ')} in ${place}${c.widen ? ' and nearby' : ''}.`
}

export { amenityLabel, typeLabel }
