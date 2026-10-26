export type Day = { date: string; name: string }
export type ChosenOption = {
  id: string
  title: string
  category: string
  date: string
  booking_url?: string | null
  price?: number | null
  currency?: string | null
}

export type CostSummary = {
  currency: string
  total: number
  budget: number | null
  over_budget_by: number
  missing_categories: string[]
  unpriced_count: number
  unconvertible_count: number
  rates: { currency: string; rate: number }[]
}

export type Reminder = {
  id: string
  text: string
  date: string
  option_id?: string | null
  option_date?: string | null
}
export type ReminderInput = { text: string; date: string; option_id: string | null }

export type Activity = { id: string; name: string; date: string; detail?: string | null }
export type ActivityInput = { name: string; date: string; detail?: string | null }
/** The stay picked from a Stay's shortlist: the lowest offer, priced in that offer's currency. */
export type ChosenStay = {
  property_id: string
  name: string
  provider: string
  url: string
  total: string
  currency: string
}
export type Stay = { id: string; place: string; start_date: string; end_date: string; chosen?: ChosenStay | null }
export type StayInput = { place: string; start_date: string; end_date: string }
export type PropertyType = 'hotel' | 'homestay' | 'other'
export type Amenity = 'wifi' | 'breakfast' | 'parking' | 'pool' | 'ac'
export type StayCriteria = {
  property_type: PropertyType
  rooms: number
  max_price: number | null
  location: string
  amenities: Amenity[]
  stars: number[]
  widen: boolean
}
export type StayOffer = {
  provider: string
  price_per_night: string
  total: string
  currency: string
  fetched_at: string
  url: string
}
export type StayProperty = {
  id: string
  name: string
  property_type: PropertyType
  rooms: number
  stars: number
  area: string
  amenities: Amenity[]
  nearby: boolean
  offers: StayOffer[]
}
export type StayOptions = {
  place: string
  start_date: string
  end_date: string
  nights: number
  properties: StayProperty[]
  price_min: string | null
  price_max: string | null
}
export type ShortlistReason = 'Best overall' | 'Best price' | 'Best match' | 'Best offers' | 'Closest to budget'
export type ShortlistStay = {
  rank: number
  property: StayProperty
  total: string
  currency: string
  fits_budget: boolean
  over_budget_by: string
  fit: number
  reason: ShortlistReason
  why: string
}
export type Shortlist = {
  place: string
  start_date: string
  end_date: string
  nights: number
  budget: string | null
  currency: string | null
  stays: ShortlistStay[]
}
export type Recommendation ={ id: string; name: string; detail: string }

/** A place from Destination results kept on a trip; it has no day until it is scheduled. */
export type TripPlace = { id: string; place_id: string; name: string; image_url?: string | null }
export type TripPlaceInput = { place_id: string; name: string; image_url: string }

export type Traveller = {
  id: string
  name: string
  citizenship?: string
  residence?: string
  health_status?: string
}

export type CompanionDetailsInput = { citizenship: string; residence: string; health_status: string }

export type TravellerRequirement = {
  traveller_id: string | null
  name: string
  citizenship: string
  residence: string
  health_status: string
  visa: string | null
  medical: string | null
}
/** An editor as the owner sees them; `invite_url` is a path on this site. */
export type Editor = { email: string; accepted: boolean; invite_url?: string }
export type Invite = { email: string; trip_name: string }

export type Trip = {
  id: string
  name: string
  destination?: string | null
  start_date?: string | null
  end_date?: string | null
  budget?: number | null
  currency?: string
  traveller_count?: number | null
  days?: Day[]
  options?: ChosenOption[]
  needed_categories?: string[]
  cost?: CostSummary | null
  reminders?: Reminder[]
  activities?: Activity[]
  stays?: Stay[]
  places?: TripPlace[]
  travellers?: Traveller[]
  editors?: Editor[]
  is_owner?: boolean
  can_edit?: boolean
  /** Owner only: a path on this site that opens the trip read-only; null when there is no link. */
  share_url?: string | null
  /** Set by GET /trips: shared with this traveller by another traveller. */
  shared?: boolean
}

export type TripInput = Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'budget'>

/** Everything New trip set-up collects; the API refuses a create without any of them. */
export type TripCreateInput = {
  name: string
  destination: string
  start_date: string
  end_date: string
  budget: number
  currency: string
  traveller_count: number
}

export type Profile = {
  display_name: string
  home_city: string
  dietary_notes: string
  citizenship: string
  residence: string
  health_status: string
  religion: string
  diet: string
  tastes: string[]
  travel_style: string
  transport_preferences: TransportPreferences
}

export type TransportMode = 'flight' | 'train' | 'bus' | 'taxi'
export type TransportCabin = 'economy' | 'premium_economy' | 'business'
export type DepartureWindow = 'morning' | 'afternoon' | 'evening' | 'night'

/** Every part is optional; an unset part never excludes an option. */
export type TransportPreferences = {
  modes: TransportMode[]
  cabin: TransportCabin | null
  departure_window: DepartureWindow | null
  max_stops: number | null
  providers: string[]
}

export const NO_TRANSPORT_PREFERENCES: TransportPreferences = {
  modes: [],
  cabin: null,
  departure_window: null,
  max_stops: null,
  providers: [],
}

export class NotFoundError extends Error {}
/** The traveller may see this trip but not change it (403). */
export class ForbiddenError extends Error {}
/** The server refused the values (422); the UI shows its own message for it. */
export class ValidationError extends Error {}
/** The place is already on this trip (409). */
export class AlreadyOnTripError extends Error {}

/** Fired when a change to a trip is answered 404: an editor's access may have just been removed. */
export const TRIP_WRITE_REFUSED = 'trip-write-refused'

// No client-side cache: every load asks the server, so every device shows the same data.
export async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 403) throw new ForbiddenError()
  if (response.status === 404) {
    if (method !== 'GET' && path.startsWith('/trips/')) window.dispatchEvent(new Event(TRIP_WRITE_REFUSED))
    throw new NotFoundError()
  }
  if (response.status === 409 && path.endsWith('/places')) throw new AlreadyOnTripError()
  if (response.status === 422) throw new ValidationError()
  if (!response.ok) throw new Error(`request failed: ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json()
}

export const fetchTrips = () => call<Trip[]>('/trips')

export const createTrip = (trip: TripCreateInput) => call<Trip>('/trips', 'POST', trip)

export const fetchTrip = (id: string) => call<Trip>(`/trips/${encodeURIComponent(id)}`)

export const updateTrip = (id: string, trip: TripInput) =>
  call<Trip>(`/trips/${encodeURIComponent(id)}`, 'PUT', trip)

export const renameDay = (id: string, date: string, name: string) =>
  call<Trip>(`/trips/${encodeURIComponent(id)}/days/${date}`, 'PUT', { name })

export const addReminder = (tripId: string, input: ReminderInput) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/reminders`, 'POST', input)

export const updateReminder = (tripId: string, id: string, input: ReminderInput) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/reminders/${encodeURIComponent(id)}`, 'PUT', input)

export const deleteReminder = (tripId: string, id: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/reminders/${encodeURIComponent(id)}`, 'DELETE')

export const fetchRecommendations = (tripId: string, date: string) =>
  call<Recommendation[]>(`/trips/${encodeURIComponent(tripId)}/days/${date}/recommendations`)

export const addActivity = (tripId: string, input: ActivityInput) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/activities`, 'POST', input)

export const addStay = (tripId: string, input: StayInput) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/stays`, 'POST', input)

export const updateStay = (tripId: string, id: string, input: StayInput) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(id)}`, 'PUT', input)

export const removeStay = (tripId: string, id: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(id)}`, 'DELETE')

/** Only the filters that are turned on are sent, so the server sees an empty one as "not turned on". */
export function stayQuery(c: StayCriteria) {
  const q = new URLSearchParams({ property_type: c.property_type, rooms: String(c.rooms) })
  if (c.max_price !== null) q.set('max_price', String(c.max_price))
  if (c.location.trim() !== '') q.set('location', c.location.trim())
  c.amenities.forEach((a) => q.append('amenities', a))
  c.stars.forEach((s) => q.append('stars', String(s)))
  if (c.widen) q.set('widen', 'true')
  return q.toString()
}

export const fetchStayOptions = (tripId: string, stayId: string, c: StayCriteria) =>
  call<StayOptions>(
    `/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/options?${stayQuery(c)}`,
  )

export const chooseStay = (tripId: string, stayId: string, propertyId: string, c: StayCriteria) =>
  call<Trip>(
    `/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/chosen?${stayQuery(c)}`,
    'PUT',
    { property_id: propertyId },
  )

export const clearChosenStay = (tripId: string, stayId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/chosen`, 'DELETE')

export const fetchStayShortlist =(tripId: string, stayId: string, c: StayCriteria) =>
  call<Shortlist>(
    `/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/shortlist?${stayQuery(c)}`,
  )

export const addPlaceToTrip = (tripId: string, input: TripPlaceInput) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/places`, 'POST', input)

export const moveActivity = (tripId: string, id: string, date: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(id)}`, 'PUT', { date })

export const removeActivity = (tripId: string, id: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(id)}`, 'DELETE')

export const saveTravellerDetails = (
  tripId: string,
  travellerId: string,
  input: CompanionDetailsInput,
) =>
  call<Trip>(
    `/trips/${encodeURIComponent(tripId)}/travellers/${encodeURIComponent(travellerId)}`,
    'PUT',
    input,
  )

export const removeTraveller = (tripId: string, travellerId: string) =>
  call<Trip>(
    `/trips/${encodeURIComponent(tripId)}/travellers/${encodeURIComponent(travellerId)}`,
    'DELETE',
  )

export const fetchRequirements = (tripId: string) =>
  call<TravellerRequirement[]>(`/trips/${encodeURIComponent(tripId)}/requirements`)

export const addTraveller = (tripId: string, name: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers`, 'POST', { name })

export const inviteEditor = (tripId: string, email: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/editors`, 'POST', { email })

export const revokeEditor = (tripId: string, email: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/editors/${encodeURIComponent(email)}`, 'DELETE')

export const createShareLink = (tripId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'POST')

export const revokeShareLink = (tripId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'DELETE')

/** Public, no session: the itinerary behind a read-only link, in the Trip shape with is_owner and can_edit false. */
export const fetchSharedTrip = (token: string) =>
  call<Trip>(`/shared/${encodeURIComponent(token)}`)

export const fetchInvite = (token: string) => call<Invite>(`/invites/${encodeURIComponent(token)}`)

export const acceptInvite = (token: string) =>
  call<{ trip_id: string }>(`/invites/${encodeURIComponent(token)}/accept`, 'POST')

export const deleteTrip =(id: string) =>
  call<void>(`/trips/${encodeURIComponent(id)}`, 'DELETE')

/** A profile saved before transport preferences existed has none: read it as nothing set. */
export const fetchProfile = async () => {
  const profile = await call<Profile>('/profile')
  return { ...profile, transport_preferences: profile.transport_preferences ?? NO_TRANSPORT_PREFERENCES }
}

export const saveProfile = (profile: Profile) => call<Profile>('/profile', 'PUT', profile)
