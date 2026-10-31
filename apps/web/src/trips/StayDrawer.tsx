import { useState } from 'react'
import { CheckIcon, XIcon } from '../auth/icons'
import { addStay, updateStay } from './api'
import type { Stay, StayInput, Trip } from './api'
import { FieldError } from './FieldError'
import { Overlay } from './Overlay'
import { StayWarningModal } from './StayWarningModal'
import { hasErrors, validateStay, warningFor } from './stays'

type StayDrawerProps = {
  trip: Trip
  /** The stay being changed; absent when adding. */
  stay?: Stay
  onClose: () => void
  onSaved: (trip: Trip, verb: 'saved' | 'updated') => void
}

/** Adds or changes a stay. Fields are checked first, then overlaps and gaps warn without blocking. */
export function StayDrawer({ trip, stay, onClose, onSaved }: StayDrawerProps) {
  const [draft, setDraft] = useState<StayInput>({
    place: stay?.place ?? '',
    start_date: stay?.start_date ?? '',
    end_date: stay?.end_date ?? '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [warning, setWarning] = useState<ReturnType<typeof warningFor>>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const errors = validateStay(draft)
  const invalid = submitted && hasErrors(errors)
  const change = (field: keyof StayInput, value: string) => setDraft({ ...draft, [field]: value })

  const send = async () => {
    setFailed(false)
    setPending(true)
    try {
      const updated = stay ? await updateStay(trip.id, stay.id, draft) : await addStay(trip.id, draft)
      onSaved(updated, stay ? 'updated' : 'saved')
    } catch {
      setWarning(null)
      setFailed(true)
      setPending(false)
    }
  }

  const save = () => {
    setSubmitted(true)
    if (hasErrors(errors)) return
    const found = warningFor({ id: stay?.id ?? '', ...draft }, trip.stays ?? [])
    if (found) setWarning(found)
    else void send()
  }

  const field = (name: 'place' | 'start' | 'end', message?: string, bad = false) => ({
    className: `input${submitted && bad ? ' is-invalid' : ''}`,
    'aria-invalid': submitted && bad ? true : undefined,
    'aria-describedby': submitted && message ? `stay-${name}-error` : undefined,
  })

  return (
    <>
      <Overlay kind="drawer" labelledBy="stay-title" covered={warning !== null} onClose={onClose}>
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <h2 id="stay-title">{stay ? 'Edit stay' : 'Add stay'}</h2>
          <div className={`field${invalid && errors.place ? ' is-invalid' : ''}`}>
            <label className="field-label" htmlFor="stay-place">
              Place
            </label>
            <input
              id="stay-place"
              autoComplete="off"
              maxLength={120}
              placeholder="City or area"
              value={draft.place}
              onChange={(event) => change('place', event.target.value)}
              {...field('place', errors.place, Boolean(errors.place))}
            />
            <span className="field-hint">Where you will be staying, like Lisbon or the Algarve.</span>
            {submitted && <FieldError id="stay-place-error" message={errors.place} />}
          </div>
          <div className={`field${submitted && errors.startBad ? ' is-invalid' : ''}`}>
            <label className="field-label" htmlFor="stay-start">
              Start date
            </label>
            <input
              id="stay-start"
              type="date"
              value={draft.start_date}
              onChange={(event) => change('start_date', event.target.value)}
              {...field('start', errors.dates, errors.startBad)}
            />
            {submitted && errors.startBad && <FieldError id="stay-start-error" message={errors.dates} />}
          </div>
          <div className={`field${submitted && errors.endBad ? ' is-invalid' : ''}`}>
            <label className="field-label" htmlFor="stay-end">
              End date
            </label>
            <input
              id="stay-end"
              type="date"
              value={draft.end_date}
              onChange={(event) => change('end_date', event.target.value)}
              {...field('end', errors.dates, errors.endBad)}
            />
            {submitted && errors.endBad && <FieldError id="stay-end-error" message={errors.dates} />}
          </div>
          {failed && (
            <p className="field-error" role="alert">
              We couldn't save that stay. Try again.
            </p>
          )}
          <div className="overlay-actions end">
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              <XIcon />
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={pending || invalid}>
              <CheckIcon />
              {pending ? 'Saving…' : 'Save stay'}
            </button>
          </div>
        </form>
      </Overlay>
      {warning && (
        <StayWarningModal
          stay={{ id: stay?.id ?? '', ...draft }}
          warning={warning}
          pending={pending}
          onChange={() => setWarning(null)}
          onSaveAnyway={send}
        />
      )}
    </>
  )
}
