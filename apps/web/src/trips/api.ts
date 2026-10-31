import type { DestinationRef, DestinationStatus } from './destination'

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
  /** Sum of the restaurant estimates in the trip currency. */
  restaurant_total?: number
  /** Restaurant picks with no estimate, left out of the total. */
  restaurant_unpriced_count?: number
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
export type SimType = 'esim' | 'physical'
/** The SIM picked for a trip: a server-held snapshot, priced per traveller in the option's currency. */
export type ChosenSim = {
  option_id: string
  name: string
  provider: string
  sim_type: SimType
  valid_from: string
  valid_to: string
  data_gb: string
  price: string
  currency: string
  url: string
}
export type SimOption = {
  id: string
  name: string
  provider: string
  source: 'web_search' | 'partner'
  sim_type: SimType
  countries: string[]
  coverage_count: number
  valid_from: string
  valid_to: string
  data_gb: string
  price: string
  currency: string
  traveller_prices: { label: string; price: string }[]
  group_total: string
  url: string
}
export type SimOptions = {
  destination: DestinationRef | null
  status: DestinationStatus
  place: string
  start_date: string | null
  end_date: string | null
  travellers: string[]
  preference: SimType | null
  options: SimOption[]
  /** The stored pick; `covers_dates` is false when the trip dates moved away from its validity. */
  picked: (ChosenSim & { covers_dates: boolean }) | null
}
/** The insurance plan picked from the shortlist: its group total at the time, in the plan's currency. */
export type InsurancePick = {
  plan_id: string
  name: string
  provider: string
  url: string
  total: string
  currency: string
}
export type InsurancePlan = {
  rank: number
  plan_id: string
  name: string
  provider: string
  source: 'web_search' | 'partner'
  fit: number
  reason: string
  offer: string | null
  traveller_prices: { label: string; age: number; price: string }[]
  group_total: string
  currency: string
  url: string
}
export type InsuranceOptions = {
  place: string
  days: number | null
  risky_activities: boolean | null
  travellers: { label: string; age: number | null }[]
  /** What the trip still lacks before plans can be matched; empty when it has everything. */
  missing: string[]
  plans: InsurancePlan[]
}
export type Stay = {
  id: string
  place: string
  start_date: string
  end_date: string
  chosen?: ChosenStay | null
  /** Set by the server when a trip date change leaves the stay not fully inside the trip. */
  outside_trip?: boolean
}
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
export type ActivityPrice = {
  provider: string
  source: 'web_search' | 'partner'
  adult_price: string
  child_price: string | null
  group_estimate: string
  currency: string
  fetched_at: string
  url: string
  offer: string | null
}
export type ActivityOption = {
  id: string
  title: string
  kind: 'ticket' | 'tour' | 'day_trip' | 'experience'
  interests: string[]
  provider: string
  adult_price: string
  child_price: string | null
  group_estimate: string
  group_estimate_indicative: boolean
  currency: string
  offer: string | null
  prices: ActivityPrice[]
}
export type ActivityOptions = {
  destination: DestinationRef | null
  status: DestinationStatus
  place: string
  travellers: number
  options: ActivityOption[]
}
export type RestaurantOption = {
  name: string
  city: string
  cuisine: string
  dining_style: string
  price_level: number
  typical_price: string | null
  currency: string
  suits: string[]
  url: string | null
}
export type RestaurantOptions = {
  destination: DestinationRef | null
  status: DestinationStatus
  place: string
  home_cuisine: string
  options: RestaurantOption[]
  /** Chips for the filters applied: the owner's profile, and needs added for this trip only. */
  filters_applied: { profile: string[]; trip: string[] }
}
export type ShortlistEntry = {
  rank: number
  restaurant: RestaurantOption
  fits_budget: boolean
  preferences_met: string[]
  preferences_total: number
}
export type RestaurantShortlist = {
  place: string
  budget_per_person: string | null
  currency: string | null
  entries: ShortlistEntry[]
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
import type { Place } from '../places/api'

export type Recommendation = {
  id: string
  name: string
  detail: string
  interest?: string | null
  place?: Place | null
}
export type TripRecommendations = {
  destination: DestinationRef | null
  status: DestinationStatus
  items: Recommendation[]
}

/** A place from Destination results kept on a trip; it has no day until it is scheduled. */
export type TripPlace = { id: string; place_id: string; name: string; image_url?: string | null }
export type TripPlaceInput = { place_id: string; name: string; image_url: string }

export type Traveller = {
  id: string
  name: string
  citizenship?: string
  residence?: string
  health_status?: string
  age?: number | null
}

export type CompanionDetailsInput = { citizenship: string; residence: string; health_status: string }

export type TravellerRequirement = {
  traveller_id: string | null
  name: string
  citizenship: string
  residence: string
  health_status: string
  medical: string | null
}
export type VaccinationGuidance = {
  name: string
  status: 'required' | 'recommended' | 'already_had' | 'unsuitable_in_pregnancy'
}
export type TravellerGuidance = {
  traveller_id: string | null
  name: string
  citizenship: string
  residence: string
  result: 'guidance' | 'no_data' | 'none_required'
  tests: string[]
  vaccinations: VaccinationGuidance[]
  advisories: string[]
  health_details_given: boolean
  official_site_url: string | null
  confirm_note: string
}


export type VisaStatus = 'required' | 'not_needed' | 'no_data'
export type VisaGuidance = {
  country: string
  entry_requirement: string
  max_stay: string
  documents: string[]
}
export type VisaResult = {
  traveller_id: string | null
  name: string
  citizenship: string
  residence: string
  status: VisaStatus | null
  message: string | null
  confirm_note: string | null
  official_site_url: string | null
  marked_self_check: boolean
  unresolved: boolean
  guidance: VisaGuidance | null
}
export type VisaView = {
  destination: DestinationRef | null
  status: DestinationStatus
  published_on: string
  travellers: VisaResult[]
}
export type MedicalGuidanceView = {
  destination: DestinationRef | null
  status: DestinationStatus
  travellers: TravellerGuidance[]
}
/** An editor as the owner sees them; `invite_url` is a path on this site. */
export type Editor = { email: string; accepted: boolean; invite_url?: string }
export type Invite = { email: string; trip_name: string }

export type Meal = 'breakfast' | 'lunch' | 'dinner'
/** A restaurant picked for the trip; no date means Unscheduled. The price is per person, null when unknown. */
export type RestaurantPick = {
  id: string
  name: string
  city: string
  cuisine: string
  typical_price: string | null
  currency: string
  url?: string | null // absent on the shared read-only view
  date: string | null
  meal: Meal | null
}

export type Trip = {
  restaurants?: RestaurantPick[]
  id: string
  unresolved_visas?: string[]
  name: string
  destination?: string | null
  country?: string | null
  place?: string | null
  destination_unmatched?: boolean
  start_date?: string | null
  end_date?: string | null
  budget?: number | null
  owner_age?: number | null
  risky_activities?: boolean | null
  currency?: string
  traveller_count?: number | null
  interests?: string[]
  days?: Day[]
  options?: ChosenOption[]
  needed_categories?: string[]
  cost?: CostSummary | null
  reminders?: Reminder[]
  activities?: Activity[]
  stays?: Stay[]
  transport?: TransportPick[]
  insurance?: InsurancePick | null
  sim?: ChosenSim | null
  places?: TripPlace[]
  travellers?: Traveller[]
  editors?: Editor[]
  is_owner?: boolean
  can_edit?: boolean
  /** Owner only: a path on this site that opens the trip read-only; null when there is no link. */
  share_url?: string | null
  /** Owner only: whether the read-only link shows the full itinerary. Off until the owner switches it on. */
  share_itinerary?: boolean
  /** Set by GET /trips: shared with this traveller by another traveller. */
  shared?: boolean
  /** Extra dining needs for this trip only (halal, gluten-free, ...). */
  dining_needs?: string[]
}

export type TripInput = Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'budget'> &
  Pick<Trip, 'owner_age' | 'risky_activities'>

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

export type TransportMode = 'flight' | 'train' | 'bus' | 'taxi'
export type TransportCabin = 'economy' | 'premium_economy' | 'business'
export type DepartureWindow = 'morning' | 'afternoon' | 'evening' | 'night'
/** Every part is optional; a part left unset never excludes an option. */
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
  dining_style?: string
  price_level?: number | null
  transport_preferences: TransportPreferences
  /** Owned by the Traveller profile epic; only ranks SIM options when set. */
  sim_preference?: SimType | null
}

/** The request needs a signed-in traveller (401). */
export class UnauthorizedError extends Error {}
export class NotFoundError extends Error {}
/** The traveller may see this trip but not change it (403). */
export class ForbiddenError extends Error {}
/** The server refused the values (422); the UI shows its own message for it. */
export class ValidationError extends Error {}
/** The place is already on this trip (409). */
export class AlreadyOnTripError extends Error {}
/** The invite was already accepted (409). */
export class InviteUsedError extends Error {}

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
  if (response.status === 401) throw new UnauthorizedError()
  if (response.status === 403) throw new ForbiddenError()
  if (response.status === 404) {
    if (method !== 'GET' && path.startsWith('/trips/')) window.dispatchEvent(new Event(TRIP_WRITE_REFUSED))
    throw new NotFoundError()
  }
  if (response.status === 409 && path.endsWith('/places')) throw new AlreadyOnTripError()
  if (response.status === 409 && (path.endsWith('/accept') || path.startsWith('/invites/'))) throw new InviteUsedError()
  if (response.status === 422) throw new ValidationError()
  if (!response.ok) throw new Error(`request failed: ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json()
}

export const fetchTrips = () => call<Trip[]>('/trips')

export const createTrip = (trip: TripCreateInput) => call<Trip>('/trips', 'POST', trip)

export const fetchTrip = (id: string) => call<Trip>(`/trips/${encodeURIComponent(id)}`)

export type ItineraryItem = {
  kind: 'stay' | 'check_in' | 'check_out' | 'transport' | 'activity' | 'meal' | 'reminder'
  title: string
  detail: string | null
  status: 'booked' | 'unbooked' | null
  link_text: string | null
  link_url: string | null
}

export type ItineraryDay = { number: number; date: string; items: ItineraryItem[] }

export type EssentialFact = {
  key: 'visa' | 'insurance' | 'sim' | 'currency' | 'weather' | 'medical'
  label: string
  value: string | null
  detail: string | null
  link_text: string | null
  link_url: string | null
  source: string | null
  as_of: string | null
}

export type ChecklistItem = {
  key: 'passport' | 'visa' | 'insurance' | 'sim' | 'reminders' | 'bookings'
  label: string
  hint: string | null
  done: boolean
}

export type ImportantNotes = {
  price_notice: string
  confirm_notice: string
  sources: { label: string; source: string; as_of: string }[]
}

export type BookingRow = {
  id: string
  kind: 'stay' | 'transport' | 'option' | 'sim' | 'insurance' | 'restaurant'
  name: string
  provider: string | null
  start_date: string | null
  end_date: string | null
  price: number | null
  currency: string | null
  status: 'confirmed'
  link_url: string | null
  outside_trip: boolean
}
export type NotIncludedItem = { name: string; reason: 'unchosen' | 'unpriced'; add_path: string | null }
export type Money = {
  bookings: BookingRow[]
  included: BookingRow[]
  not_included: NotIncludedItem[]
  standard_exclusions: string[]
  cost: {
    currency: string
    total: number
    by_currency: { currency: string; total: number }[]
    conversions: { currency: string; rate: number; rate_date: string }[]
    estimates_note: string
  }
}

/** The printable trip document with a read-only money block; the server leaves out editors and sharing. */
export type Itinerary = {
  cover: { name: string; start_date: string | null; end_date: string | null; destinations: string[] }
  glance: { booked: number; unbooked: number }
  days: ItineraryDay[]
  still_to_schedule: ItineraryItem[]
  money?: Money // missing from an older API build
  essentials: EssentialFact[]
  checklist: ChecklistItem[]
  notes: ImportantNotes
}

export const fetchItinerary = (tripId: string) =>
  call<Itinerary>(`/trips/${encodeURIComponent(tripId)}/itinerary`)

/** Emails the complete itinerary, as HTML, to the signed-in traveller. */
export const emailItinerary = (tripId: string) =>
  call<void>(`/trips/${encodeURIComponent(tripId)}/itinerary/email`, 'POST')

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

export const fetchTripRecommendations = (tripId: string) =>
  call<TripRecommendations>(`/trips/${encodeURIComponent(tripId)}/recommendations`)

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

export const fetchActivityOptions = (tripId: string) =>
  call<ActivityOptions>(`/trips/${encodeURIComponent(tripId)}/activity-options`)

export const fetchRestaurantOptions = (tripId: string) =>
  call<RestaurantOptions>(`/trips/${encodeURIComponent(tripId)}/restaurant-options`)

export const fetchRestaurantShortlist = (tripId: string) =>
  call<RestaurantShortlist>(`/trips/${encodeURIComponent(tripId)}/restaurant-shortlist`)

export const pickRestaurant = (
  tripId: string,
  input: { name: string; city: string; date: string | null; meal: Meal | null },
) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/restaurants`, 'POST', input)

export const moveRestaurant = (tripId: string, id: string, input: { date: string | null; meal: Meal | null }) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/restaurants/${encodeURIComponent(id)}`, 'PUT', input)

export const saveDiningNeeds = (tripId: string, needs: string[]) =>
  call<{ needs: string[] }>(`/trips/${encodeURIComponent(tripId)}/dining-needs`, 'PUT', { needs })
export const fetchSimOptions = (tripId: string) =>
  call<SimOptions>(`/trips/${encodeURIComponent(tripId)}/sim-options`)

export const pickSim = (tripId: string, optionId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/sim`, 'PUT', { option_id: optionId })

export const clearSim = (tripId: string) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/sim`, 'DELETE')

export const fetchInsuranceOptions = (tripId: string) =>
  call<InsuranceOptions>(`/trips/${encodeURIComponent(tripId)}/insurance-options`)

export const chooseInsurance = (tripId: string, planId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/insurance`, 'PUT', { plan_id: planId })

export const clearInsurance = (tripId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/insurance`, 'DELETE')

export const chooseStay =(tripId: string, stayId: string, propertyId: string, c: StayCriteria) =>
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

export type SourceResult = { name: string; status: 'ok' | 'failed' | 'timed_out'; modes?: TransportMode[] }
/** One single-mode option on a leg: a flight, train, bus or taxi. */
export type FlightOption = {
  id: string
  mode: TransportMode
  /** True when the fare is an estimate, as for a taxi. */
  estimate?: boolean
  provider: string
  source: string
  fare: string
  currency: string
  travel_minutes: number
  stops: number
  departs?: string | null
  cabin?: string | null
  deal?: string | null
  fetched_at: string
  url: string
}
export type ShortlistFlight = {
  rank: number
  flight: FlightOption
  fit: number
  fits_budget: boolean
  over_budget_by: string
  reason: string
}
export type FlightShortlist = {
  origin: string
  destination: string
  date: string
  budget: number | null
  currency: string
  sources: SourceResult[]
  flights: ShortlistFlight[]
  /** Modes with no entries on this leg, whose sources all answered. */
  no_service: TransportMode[]
}

export const fetchFlightShortlist = (tripId: string, origin: string, destination: string, date: string) =>
  call<FlightShortlist>(
    `/trips/${encodeURIComponent(tripId)}/flights/shortlist?${new URLSearchParams({ origin, destination, date })}`,
  )

export type TransportLeg = 'destination' | 'between_cities' | 'local_taxi'
/** A shortlist option the traveller picked for a leg; the fare and booking link come from the provider. */
export type TransportPick = {
  leg: TransportLeg
  option_id: string
  mode: TransportMode
  provider: string
  origin: string
  destination: string
  date: string
  estimate: boolean
  fare: string
  picked_fare: string
  currency: string
  url: string
}

export const pickTransport = (
  tripId: string,
  leg: TransportLeg,
  route: { origin: string; destination: string; date: string; optionId: string },
) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/transport/${leg}`, 'PUT', {
    origin: route.origin,
    destination: route.destination,
    date: route.date,
    option_id: route.optionId,
  })

export const clearTransport = (tripId: string, leg: TransportLeg) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/transport/${leg}`, 'DELETE')

export const refreshTransport = (tripId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/transport/refresh`, 'POST')

export const addPlaceToTrip =(tripId: string, input: TripPlaceInput) =>
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

export const fetchVisa = (tripId: string) =>
  call<VisaView>(`/trips/${encodeURIComponent(tripId)}/visa`)

export const setVisaSelfCheck = (tripId: string, key: string, checked: boolean) =>
  call<VisaView>(
    `/trips/${encodeURIComponent(tripId)}/visa/${encodeURIComponent(key)}/self-check`,
    'PUT',
    { checked },
  )

export const fetchMedicalGuidance = (tripId: string) =>
  call<MedicalGuidanceView>(`/trips/${encodeURIComponent(tripId)}/medical-guidance`)

export const addTraveller = (tripId: string, name: string, age?: number) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers`, 'POST', age === undefined ? { name } : { name, age })

/** Saves the owner's age and the risky-activities answer; the trip's own fields are resent so none is reset. */
export const saveInsuranceDetails = (trip: Trip, ownerAge: number, risky: boolean) =>
  updateTrip(trip.id, {
    name: trip.name,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    budget: trip.budget,
    owner_age: ownerAge,
    risky_activities: risky,
  })

export const inviteEditor = (tripId: string, email: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/editors`, 'POST', { email })

export const revokeEditor = (tripId: string, email: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/editors/${encodeURIComponent(email)}`, 'DELETE')

export const createShareLink = (tripId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'POST')

export const revokeShareLink = (tripId: string) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'DELETE')

/** Owner only: show or hide the complete itinerary on the read-only link. */
export const setShareItinerary = (tripId: string, show: boolean) =>
  call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link/itinerary`, 'PUT', { show })

/** What a visitor gets: the Trip fields, plus the complete itinerary only while the owner has it switched on. */
export type SharedTrip = Trip & { itinerary_shared?: boolean; itinerary?: Itinerary | null }

/** Public, no session: the trip behind a read-only link, with is_owner and can_edit false. */
export const fetchSharedTrip = (token: string) =>
  call<SharedTrip>(`/shared/${encodeURIComponent(token)}`)

export const fetchInvite = (token: string) => call<Invite>(`/invites/${encodeURIComponent(token)}`)

export const acceptInvite = (token: string) =>
  call<{ trip_id: string }>(`/invites/${encodeURIComponent(token)}/accept`, 'POST')

export const deleteTrip =(id: string) =>
  call<void>(`/trips/${encodeURIComponent(id)}`, 'DELETE')

/** A profile saved before transport preferences existed comes back without the block. */
export async function fetchProfile(): Promise<Profile> {
  const profile = await call<Profile>('/profile')
  return { ...profile, transport_preferences: profile.transport_preferences ?? NO_TRANSPORT_PREFERENCES }
}

export const saveProfile = (profile: Profile) => call<Profile>('/profile', 'PUT', profile)
