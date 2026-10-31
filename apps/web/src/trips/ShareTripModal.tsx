import { useState } from 'react'
import { XIcon } from '../auth/icons'
import { createShareLink, revokeShareLink, setShareItinerary } from './api'
import type { Trip } from './api'
import { Overlay } from './Overlay'

type ShareTripModalProps = {
  trip: Trip
  onClose: () => void
  onChanged: (trip: Trip, message: string) => void
  onCopied: () => void
}

/** Owner only: create the read-only link, copy it, or turn it off. */
export function ShareTripModal({ trip, onClose, onChanged, onCopied }: ShareTripModalProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState(trip.share_itinerary ?? false)
  const link = trip.share_url ? `${window.location.origin}${trip.share_url}` : null

  const change = async (action: () => Promise<Trip>, message: string, failure: string) => {
    setPending(true)
    setError(null)
    try {
      onChanged(await action(), message)
    } catch {
      setError(failure)
    } finally {
      setPending(false)
    }
  }

  const copy = async () => {
    if (link === null) return
    try {
      await navigator.clipboard.writeText(link)
      onCopied()
    } catch {
      setError("We couldn't copy that link. Select it and copy it yourself.")
    }
  }

  return (
    <Overlay kind="modal" labelledBy="share-title" onClose={onClose}>
      <div className="stack stack-lg">
        <div className="title-row">
          <h2 id="share-title">Share trip</h2>
          <button className="btn btn-ghost" type="button" aria-label="Close" onClick={onClose}>
            <XIcon />
          </button>
        </div>
        {link === null ? (
          <>
            <p>Anyone with a read-only link can view the itinerary. They cannot change it.</p>
            <div className="overlay-actions end">
              <button
                className="btn btn-primary"
                type="button"
                disabled={pending}
                onClick={() =>
                  change(
                    () => createShareLink(trip.id),
                    'Read-only link created.',
                    "We couldn't create that link. Try again.",
                  )
                }
              >
                {pending ? 'Creating link' : 'Create read-only link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor="read-only-link">
                  Read-only link
                </label>
                <input
                  id="read-only-link"
                  className="input"
                  readOnly
                  value={link}
                  aria-describedby="read-only-link-hint"
                />
                <span className="field-hint" id="read-only-link-hint">
                  Viewers can see the itinerary but cannot change it.
                </span>
              </div>
              <button className="btn btn-secondary" type="button" onClick={copy}>
                Copy link
              </button>
            </div>
            <fieldset className="share-itinerary stack stack-sm">
              <legend>Show itinerary on share link</legend>
              <label className="check">
                <input
                  className="radio"
                  type="radio"
                  name="show-itinerary"
                  checked={show}
                  onChange={() => setShow(true)}
                />
                <span>
                  <span className="text-bold">On</span>
                  <br />
                  <span className="field-hint">
                    Visitors see the full itinerary, including money, inclusions and travel essentials.
                  </span>
                </span>
              </label>
              <label className="check">
                <input
                  className="radio"
                  type="radio"
                  name="show-itinerary"
                  checked={!show}
                  onChange={() => setShow(false)}
                />
                <span>
                  <span className="text-bold">Off</span>
                  <br />
                  <span className="field-hint">
                    Visitors see the trip name only. This is the default.
                  </span>
                </span>
              </label>
              <p className="field-hint">
                Switching off applies to new visits. Pages already open keep what they loaded until they reload.
              </p>
              <div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    change(
                      () => setShareItinerary(trip.id, show),
                      show
                        ? 'Saved. The share link now shows the full itinerary.'
                        : 'Saved. The share link hides the itinerary.',
                      "We couldn't save that. Try again.",
                    )
                  }
                >
                  Save
                </button>
              </div>
            </fieldset>
            <p className="field-hint">
              Turning the link off stops it working straight away, including for anyone who has the
              trip open.
            </p>
            <div className="overlay-actions end">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={pending}
                onClick={() =>
                  change(
                    async () => {
                      const revoked = await revokeShareLink(trip.id)
                      setShow(false) // a link made later starts Off again
                      return revoked
                    },
                    'Link turned off.',
                    "We couldn't turn off that link. Try again.",
                  )
                }
              >
                {pending ? 'Turning off link' : 'Turn off link'}
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Overlay>
  )
}
