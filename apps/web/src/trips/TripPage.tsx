import { useParams } from 'react-router'
import { NewTripSetupPage } from './NewTripSetupPage'
import { TripDetailPage } from './TripDetailPage'

// `/trips/new` has no :tripId, so it creates; `/trips/:tripId` shows the trip. `key` resets per trip.
export function TripPage() {
  const { tripId } = useParams()
  return tripId ? <TripDetailPage key={tripId} tripId={tripId} /> : <NewTripSetupPage />
}
