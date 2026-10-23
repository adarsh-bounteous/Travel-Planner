import { useParams } from 'react-router'
import { TripForm } from './TripForm'

// `/trips/new` has no :tripId, so it creates; `/trips/:tripId` edits. `key` resets the form per trip.
export function TripPage() {
  const { tripId } = useParams()
  return <TripForm key={tripId ?? 'new'} tripId={tripId} />
}
