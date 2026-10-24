import { AlertIcon } from '../auth/icons'

/** What anyone sees at a read-only link that is turned off or never existed. It carries no trip data. */
export function LinkUnavailable() {
  return (
    <div className="stack stack-sm unavailable" role="alert">
      <AlertIcon />
      <h1>Link no longer available</h1>
      <p>This read-only link is no longer available. Ask the trip owner for a new link.</p>
    </div>
  )
}
