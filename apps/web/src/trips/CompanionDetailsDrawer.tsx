import { useState } from 'react'
import type { FormEvent } from 'react'
import { saveTravellerDetails } from './api'
import type { CompanionDetailsInput, Trip, Traveller } from './api'
import { COMPANION_FIELDS, companionErrors } from './companionDetails'
import type { CompanionKey } from './companionDetails'
import { FieldError } from './FieldError'
import { Overlay } from './Overlay'

type CompanionDetailsDrawerProps = {
  tripId: string
  traveller: Traveller
  onClose: () => void
  onSaved: (trip: Trip, name: string) => void
}

/** Edits one companion's citizenship, residence and health status. They stay with this trip only. */
export function CompanionDetailsDrawer({
  tripId,
  traveller,
  onClose,
  onSaved,
}: CompanionDetailsDrawerProps) {
  const [values, setValues] = useState<CompanionDetailsInput>({
    citizenship: traveller.citizenship ?? '',
    residence: traveller.residence ?? '',
    health_status: traveller.health_status ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<CompanionKey, string>>>({})
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = companionErrors(values)
    setErrors(found)
    setFailed(false)
    const first = COMPANION_FIELDS.find((f) => found[f.key])
    if (first) return document.getElementById(`companion-${first.key}`)?.focus()
    setPending(true)
    try {
      onSaved(await saveTravellerDetails(tripId, traveller.id, values), traveller.name)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <Overlay kind="drawer" labelledBy="companion-title" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="stack stack-sm">
          <h2 id="companion-title">{traveller.name}</h2>
          <p className="text-muted text-sm">
            We use these to check visa and medical needs for this trip. They aren't saved to any
            profile.
          </p>
        </div>
        {COMPANION_FIELDS.map((field) => {
          const error = errors[field.key]
          const id = `companion-${field.key}`
          return (
            <div className={`field${error ? ' is-invalid' : ''}`} key={field.key}>
              <label className="field-label" htmlFor={id}>
                {field.label}
              </label>
              <select
                id={id}
                className={`select${error ? ' is-invalid' : ''}`}
                value={values[field.key]}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
              >
                <option value="">{field.placeholder}</option>
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <span className="field-hint" id={`${id}-hint`}>
                {field.hint}
              </span>
              <FieldError id={`${id}-error`} message={error} />
            </div>
          )
        })}
        {failed && (
          <p className="field-error" role="alert">
            We couldn't save those details. Try again.
          </p>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}
