import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon, ArrowRightIcon, EyeIcon, ListIcon } from '../auth/icons'
import { emailItinerary } from './api'
import { Toast } from './Toast'

type ItineraryActionsProps = {
  tripId: string
  /** The traveller's own address: where the copy goes. */
  email: string
  /** False on the itinerary page itself, where View itinerary would lead nowhere. */
  showView?: boolean
  /** Prints in place. Without it, Print or Save as PDF opens the itinerary page and prints there. */
  onPrint?: () => void
}

/** View, print or save, and email the full itinerary. Sending a copy is one at a time. */
export function ItineraryActions({ tripId, email, showView = true, onPrint }: ItineraryActionsProps) {
  const sending = useRef(false) // set before any state update, so a quick second press is a no-op
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle')
  const [sentId, setSentId] = useState<number | null>(null)
  const itineraryPath = `/trips/${encodeURIComponent(tripId)}/itinerary`

  const send = async () => {
    if (sending.current) return
    sending.current = true
    setState('sending')
    try {
      await emailItinerary(tripId)
      setState('idle')
      setSentId(Date.now())
    } catch {
      setState('failed')
    } finally {
      sending.current = false
    }
  }

  return (
    <div className="stack stack-sm">
      <div className="cluster actions" role="group" aria-label="Itinerary actions">
        {showView && (
          <Link className="btn btn-primary" to={itineraryPath}>
            <EyeIcon />
            View itinerary
          </Link>
        )}
        {onPrint ? (
          <button className="btn btn-secondary" type="button" onClick={onPrint}>
            <ListIcon />
            Print or Save as PDF
          </button>
        ) : (
          <Link className="btn btn-secondary" to={`${itineraryPath}?print=1`}>
            <ListIcon />
            Print or Save as PDF
          </Link>
        )}
        <button
          className="btn btn-secondary"
          type="button"
          aria-disabled={state === 'sending' ? 'true' : undefined}
          aria-busy={state === 'sending' ? 'true' : undefined}
          onClick={send}
        >
          {state === 'sending' ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Sending copy…
            </>
          ) : (
            <>
              <ArrowRightIcon />
              Email me a copy
            </>
          )}
        </button>
      </div>
      {state === 'failed' ? (
        <div className="alert alert-danger" role="alert">
          <AlertIcon />
          <p>
            <span className="alert-title">The email could not be sent.</span> Nothing arrived in your inbox. Try
            again in a moment.
          </p>
        </div>
      ) : (
        <p className="field-hint">
          {state === 'sending'
            ? `Sending one copy to ${email}. Pressing again won’t send a second one.`
            : `The full itinerary arrives as HTML at ${email}. In local mode it lands in the local inbox.`}
        </p>
      )}
      {sentId !== null && <Toast key={sentId} message={`Copy sent to ${email}. Check your inbox.`} />}
    </div>
  )
}
