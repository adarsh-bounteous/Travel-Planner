import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertIcon, TrashIcon } from '../auth/icons'
import { ForbiddenError, addReminder, deleteReminder, updateReminder } from './api'
import type { Reminder, Trip } from './api'
import { formatDay } from './ItineraryTab'
import { Overlay } from './Overlay'

type ReminderModalProps = {
  trip: Trip
  /** Add mode when there is no reminder; `optionId` preselects the activity it was opened from. */
  reminder?: Reminder
  optionId?: string
  onClose: () => void
  onSaved: (trip: Trip, message: string) => void
  onDeleted: (trip: Trip, reminder: Reminder) => void
}

const TEXT_ERROR = 'Write what to remember, then save.'

/** "3 to 5 March", or "3 March to 2 April" when the trip spans months. */
function dayRange(first: string, last: string) {
  const [from, to] = [formatDay(first), formatDay(last)]
  if (first === last) return to
  return from.split(' ')[1] === to.split(' ')[1] ? `${from.split(' ')[0]} to ${to}` : `${from} to ${to}`
}

export function ReminderModal({
  trip,
  reminder,
  optionId,
  onClose,
  onSaved,
  onDeleted,
}: ReminderModalProps) {
  const days = trip.days ?? []
  const options = trip.options ?? []
  const first = days[0]?.date ?? ''
  const last = days[days.length - 1]?.date ?? ''
  const range = dayRange(first, last)
  const [attachTo, setAttachTo] = useState(reminder ? (reminder.option_id ?? '') : (optionId ?? ''))
  const [text, setText] = useState(reminder?.text ?? '')
  const [date, setDate] = useState(
    reminder?.date ?? options.find((o) => o.id === optionId)?.date ?? first,
  )
  const [errors, setErrors] = useState<{ text?: string; date?: string; form?: string }>({})
  const [pending, setPending] = useState(false)
  const attached = options.find((o) => o.id === reminder?.option_id)

  const run = async (request: () => Promise<void>) => {
    setPending(true)
    try {
      await request()
    } catch (reason) {
      setErrors({
        form:
          reason instanceof ForbiddenError
            ? 'You can view this trip but not change it.'
            : "We couldn't save this reminder. Try again.",
      })
      setPending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: typeof errors = {}
    if (text.trim() === '') found.text = TEXT_ERROR
    if (!days.some((d) => d.date === date))
      found.date = `That date isn't on this trip. Pick a day from ${range}.`
    setErrors(found)
    if (found.text || found.date) return
    const input = { text: text.trim(), date, option_id: attachTo || null }
    void run(async () => {
      const updated = reminder
        ? await updateReminder(trip.id, reminder.id, input)
        : await addReminder(trip.id, input)
      onSaved(updated, `Reminder saved for ${formatDay(date)}.`)
    })
  }

  const remove = () => {
    if (!reminder) return
    void run(async () => onDeleted(await deleteReminder(trip.id, reminder.id), reminder))
  }

  const fieldError = (id: string, message?: string) =>
    message && (
      <p className="field-error cluster" id={id} role="alert">
        <AlertIcon />
        <span>{message}</span>
      </p>
    )

  return (
    <Overlay kind="modal" labelledBy="reminder-title" onClose={onClose}>
      <form className="stack stack-lg" noValidate onSubmit={submit}>
        <div className="stack stack-sm">
          <h2 id="reminder-title">{reminder ? 'Edit reminder' : 'Add reminder'}</h2>
          {reminder && (
            <p className="text-muted">
              Attached to {attached ? attached.title : 'the whole trip'}
            </p>
          )}
        </div>
        {!reminder && (
          <div className="field">
            <label className="field-label" htmlFor="reminder-attach">
              Attach to
            </label>
            <select
              className="select"
              id="reminder-attach"
              value={attachTo}
              onChange={(event) => setAttachTo(event.target.value)}
            >
              <option value="">Whole trip</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={`field${errors.text ? ' is-invalid' : ''}`}>
          <label className="field-label" htmlFor="reminder-text">
            Reminder
          </label>
          <input
            className="input"
            id="reminder-text"
            autoComplete="off"
            maxLength={280}
            placeholder="What to remember"
            aria-invalid={errors.text ? true : undefined}
            aria-describedby={errors.text ? 'reminder-text-error' : undefined}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {fieldError('reminder-text-error', errors.text)}
        </div>
        <div className={`field${errors.date ? ' is-invalid' : ''}`}>
          <label className="field-label" htmlFor="reminder-date">
            Date
          </label>
          <input
            className="input"
            id="reminder-date"
            type="date"
            min={first}
            max={last}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={
              errors.date ? 'reminder-date-hint reminder-date-error' : 'reminder-date-hint'
            }
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <span className="field-hint" id="reminder-date-hint">
            {reminder
              ? `Pick a day from ${range}.`
              : `Pick a day from ${range}. The note shows in the itinerary on that day. In-app only: no email or push.`}
          </span>
          {fieldError('reminder-date-error', errors.date)}
        </div>
        {errors.form && (
          <p className="field-error cluster" role="alert">
            <AlertIcon />
            <span>{errors.form}</span>
          </p>
        )}
        <div className="overlay-actions">
          {reminder ? (
            <button className="btn btn-ghost" type="button" disabled={pending} onClick={remove}>
              <TrashIcon />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="overlay-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Overlay>
  )
}
