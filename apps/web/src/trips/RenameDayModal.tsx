import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertIcon, CheckIcon, XIcon } from '../auth/icons'
import { renameDay } from './api'
import type { Day, Trip } from './api'
import { Overlay } from './Overlay'

type RenameDayModalProps = {
  tripId: string
  day: Day
  position: number
  onClose: () => void
  onRenamed: (trip: Trip, name: string) => void
}

export function RenameDayModal({ tripId, day, position, onClose, onRenamed }: RenameDayModalProps) {
  const [name, setName] = useState(day.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setError("Day name can't be blank. Enter a name or cancel to keep the old one.")
      input.current?.focus()
      return
    }
    setError(null)
    setPending(true)
    try {
      onRenamed(await renameDay(tripId, day.date, trimmed), trimmed)
    } catch {
      setError("We couldn't rename this day. Try again.")
      setPending(false)
    }
  }

  return (
    <Overlay kind="modal" labelledBy="rename-title" onClose={onClose}>
      <form className="stack stack-lg" noValidate onSubmit={submit}>
        <h2 id="rename-title">{`Rename day ${position}`}</h2>
        <div className={`field${error ? ' is-invalid' : ''}`}>
          <label className="field-label" htmlFor="day-name-input">
            Day name
          </label>
          <input
            ref={input}
            className="input"
            id="day-name-input"
            autoComplete="off"
            maxLength={120}
            placeholder={`Day ${position}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'day-name-hint day-name-error' : 'day-name-hint'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <span className="field-hint" id="day-name-hint">
            For example "Arrival" or "Beach day".
          </span>
          {error && (
            <p className="field-error cluster" id="day-name-error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </p>
          )}
        </div>
        <div className="overlay-actions end">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <XIcon />
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            <CheckIcon />
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}
