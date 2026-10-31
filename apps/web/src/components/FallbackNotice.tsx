import { AlertIcon } from '../auth/icons'

/** Tells the traveller a result is saved data. Source values follow the API's "live" | "fallback". */
export function FallbackNotice({ source }: { source: string }) {
  if (source !== 'fallback') return null
  return (
    <div className="alert alert-warning cluster fallback-notice" role="status">
      <AlertIcon />
      <span>Live data unavailable, showing saved data</span>
    </div>
  )
}
