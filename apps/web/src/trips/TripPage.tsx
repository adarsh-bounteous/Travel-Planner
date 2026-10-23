import { useParams } from 'react-router'
import { TripDetailPage } from './TripDetailPage'
import { TripForm } from './TripForm'

// `/trips/new` has no :tripId, so it creates; `/trips/:tripId` shows the trip. `key` resets per trip.
export function TripPage() {
  const { tripId } = useParams()
  return tripId ? <TripDetailPage key={tripId} tripId={tripId} /> : <TripForm />
}
