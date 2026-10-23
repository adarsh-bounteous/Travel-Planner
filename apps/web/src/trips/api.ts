export type Day = { date: string; name: string }
export type ChosenOption = {
  id: string
  title: string
  category: string
  date: string
  booking_url?: string | null
}

export type Reminder = {
  id: string
  text: string
  date: string
  option_id?: string | null
  option_date?: string | null
}
export type ReminderInput = { text: string; date: string; option_id: string | null }

export type Trip = {
  id: string
  name: string
  destination?: string | null
  start_date?: string | null
  end_date?: string | null
  budget?: number | null
  currency?: string
  days?: Day[]
  options?: ChosenOption[]
  reminders?: Reminder[]
  is_owner?: boolean
  can_edit?: boolean
}

export type TripInput = Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'budget'>

export type Profile = { display_name: string; home_city: string; dietary_notes: string }

export class NotFoundError extends Error {}
/** The traveller may see this trip but not change it (403). */
export class ForbiddenError extends Error {}
/** The server refused the values (422); the UI shows its own message for it. */
export class ValidationError extends Error {}

// No client-side cache: every load asks the server, so every device shows the same data.
export async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 403) throw new ForbiddenError()
  if (response.status === 404) throw new NotFoundError()
  if (response.status === 422) throw new ValidationError()
  if (!response.ok) throw new Error(`request failed: ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json()
}

export const fetchTrips = () => call<Trip[]>('/trips')

export const createTrip = (trip: TripInput) => call<Trip>('/trips', 'POST', trip)

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

export const deleteTrip =(id: string) =>
  call<void>(`/trips/${encodeURIComponent(id)}`, 'DELETE')

export const fetchProfile = () => call<Profile>('/profile')

export const saveProfile = (profile: Profile) => call<Profile>('/profile', 'PUT', profile)
