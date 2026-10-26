import type { Amenity, PropertyType, ShortlistStay, StayCriteria } from './api'

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

/** The criteria the stay options page applied, read back from the link it hands to the shortlist. */
export function criteriaFromQuery(q: URLSearchParams): StayCriteria {
  const max = q.get('max_price')
  const type = q.get('property_type')
  return {
    property_type: PROPERTY_TYPES.some((t) => t.id === type) ? (type as PropertyType) : DEFAULT_CRITERIA.property_type,
    rooms: Number(q.get('rooms')) || DEFAULT_CRITERIA.rooms,
    max_price: max !== null && max !== '' ? Number(max) : null,
    location: q.get('location') ?? '',
    amenities: q.getAll('amenities').filter((a): a is Amenity => AMENITIES.some((x) => x.id === a)),
    stars: q.getAll('stars').map(Number).filter((s) => STAR_RATINGS.includes(s)),
    widen: q.get('widen') === 'true',
  }
}

/** Which shortlisted stays hold the lowest total, the best fit and the most offers; ties mark every stay. */
export function comparisonMarks(stays: ShortlistStay[]) {
  const holders = (value: (s: ShortlistStay) => number, best: number) =>
    stays.filter((s) => value(s) === best).map((s) => s.property.id)
  const total = (s: ShortlistStay) => Number(s.total)
  const offers = (s: ShortlistStay) => s.property.amenities.length
  return {
    lowestPrice: holders(total, Math.min(...stays.map(total))),
    bestFit: holders((s) => s.fit, Math.max(...stays.map((s) => s.fit))),
    mostOffers: holders(offers, Math.max(...stays.map(offers))),
  }
}

export { amenityLabel, typeLabel }
