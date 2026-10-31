import { useState } from 'react'
import { AlertIcon, CalendarIcon, CheckIcon, XIcon } from '../auth/icons'
import { updateStay } from './api'
import type { Stay, Trip } from './api'
import { FieldError } from './FieldError'
import { Overlay } from './Overlay'
import { formatRange, outsideReason, sortStays } from './stays'

type StaysReviewDrawerProps = {
  trip: Trip
  onSaved: (trip: Trip) => void
  onClose: () => void
}

type ReviewCardProps = { trip: Trip; stay: Stay; onSaved: (trip: Trip) => void }

/** One stay after the date change: flagged ones can keep their dates or have them adjusted. */
function ReviewCard({ trip, stay, onSaved }: ReviewCardProps) {
  const [mode, setMode] = useState<'idle' | 'kept' | 'adjusting'>('idle')
  const [start, setStart] = useState(stay.start_date)
  const [end, setEnd] = useState(stay.end_date)
  const [invalid, setInvalid] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)

  const apply = async () => {
    setFailed(false)
    if (end < start) return setInvalid(true)
    setInvalid(false)
    setPending(true)
    try {
      onSaved(await updateStay(trip.id, stay.id, { place: stay.place, start_date: start, end_date: end }))
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <div className={`card stack${stay.outside_trip ? ' stay-flagged' : ''}`}>
      <div>
        <div className="stay-place">{stay.place}</div>
        <div className="text-muted">{formatRange(stay.start_date, stay.end_date)}</div>
      </div>
      {stay.outside_trip && trip.start_date && trip.end_date ? (
        <>
          <div className="stay-flags">
            <span className="badge badge-warning">
              <AlertIcon />
              Outside trip
            </span>
          </div>
          <p className="text-sm text-muted">{outsideReason(stay, trip.start_date, trip.end_date)}</p>
          {mode === 'kept' && <p className="text-sm">Dates kept. This stay stays marked Outside trip.</p>}
          {mode === 'adjusting' ? (
            <div className="stack">
              <div className="form-row">
                <div className="field">
                  <label className="field-label" htmlFor={`review-start-${stay.id}`}>
                    Check-in
                  </label>
                  <input
                    id={`review-start-${stay.id}`}
                    className="input"
                    type="date"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`review-end-${stay.id}`}>
                    Check-out
                  </label>
                  <input
                    id={`review-end-${stay.id}`}
                    className={`input${invalid ? ' is-invalid' : ''}`}
                    type="date"
                    value={end}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </div>
              </div>
              {invalid && <FieldError id={`review-error-${stay.id}`} message="Check-out must be on or after check-in." />}
              {failed && (
                <p className="field-error" role="alert">
                  We couldn't save those dates. Try again.
                </p>
              )}
              <div>
                <button className="btn btn-primary btn-sm" type="button" disabled={pending} onClick={apply}>
                  <CheckIcon />
                  {pending ? 'Saving…' : 'Apply dates'}
                </button>
              </div>
            </div>
          ) : (
            <div className="cluster">
              <button className="btn btn-secondary" type="button" onClick={() => setMode('kept')}>
                <XIcon />
                Keep dates
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setMode('adjusting')}>
                <CalendarIcon />
                Adjust dates
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Inside your trip.</p>
      )}
    </div>
  )
}

/** Opens after a date save that flagged a stay: the traveller sees every stay against the new dates. */
export function StaysReviewDrawer({ trip, onSaved, onClose }: StaysReviewDrawerProps) {
  return (
    <Overlay kind="drawer" labelledBy="review-title" onClose={onClose}>
      <div className="stack">
        <h2 id="review-title">
          <CalendarIcon />
          Stays after date change
        </h2>
        <p>
          Your trip now runs{' '}
          <span className="text-bold">
            {trip.start_date && trip.end_date ? formatRange(trip.start_date, trip.end_date) : ''}
          </span>
          . Stays marked Outside trip are not fully within these dates.
        </p>
        <div className="stack" aria-live="polite">
          {sortStays(trip.stays ?? []).map((stay) => (
            <ReviewCard key={stay.id} trip={trip} stay={stay} onSaved={onSaved} />
          ))}
        </div>
        <button className="btn btn-primary" type="button" onClick={onClose}>
          <CheckIcon />
          Done
        </button>
      </div>
    </Overlay>
  )
}
