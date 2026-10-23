export type Trip = {
  id: string
  name: string
  destination?: string | null
  start_date?: string | null
  end_date?: string | null
}

export type TripInput = Omit<Trip, 'id'>

export type Profile = { display_name: string; home_city: string; dietary_notes: string }

export class NotFoundError extends Error {}

// No client-side cache: every load asks the server, so every device shows the same data.
async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) throw new Error(`request failed: ${response.status}`)
  return response.json()
}

export const fetchTrips = () => call<Trip[]>('/trips')

export const createTrip = (trip: TripInput) => call<Trip>('/trips', 'POST', trip)

export const fetchTrip = (id: string) => call<Trip>(`/trips/${encodeURIComponent(id)}`)

export const updateTrip = (id: string, trip: TripInput) =>
  call<Trip>(`/trips/${encodeURIComponent(id)}`, 'PUT', trip)

export const fetchProfile = () => call<Profile>('/profile')

export const saveProfile = (profile: Profile) => call<Profile>('/profile', 'PUT', profile)
