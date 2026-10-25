import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { FieldError } from '../trips/FieldError'
import { Overlay } from '../trips/Overlay'
import { SELECT_QUESTIONS, TASTES } from '../trips/profileQuestions'
import type { ProfileQuestionKey } from '../trips/profileQuestions'
import { answerError, labelOf } from './profileAnswers'

type ProfileAnswerDrawerProps = {
  mode: 'edit' | 'add'
  question: ProfileQuestionKey
  /** The saved value; empty when adding. */
  value: string | string[]
  onClose: () => void
  /** Rejects when the answer could not be saved. */
  onSave: (value: string | string[]) => Promise<void>
}

/** Edits or adds one saved profile answer. It updates the profile for every trip. */
export function ProfileAnswerDrawer({
  mode,
  question,
  value,
  onClose,
  onSave,
}: ProfileAnswerDrawerProps) {
  const [current, setCurrent] = useState(value)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const fieldRef = useRef<HTMLSelectElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)

  // Errors show only after Save or Clear answer; focus goes back to the field.
  useEffect(() => {
    if (error) (fieldRef.current ?? groupRef.current?.querySelector('button'))?.focus()
  }, [error])

  const label = labelOf(question)
  const id = `profile-answer-${question}`
  const empty = question === 'tastes' ? [] : ''

  const save = async (next: string | string[]) => {
    const found = answerError(question, next, mode)
    setError(found)
    setFailed(false)
    if (found) return
    setPending(true)
    try {
      await onSave(next)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  const change = (next: string | string[]) => {
    setCurrent(next)
    setError(undefined)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save(current)
  }

  const describedBy = `${id}-hint${error ? ` ${id}-error` : ''}`

  return (
    <Overlay kind="drawer" labelledBy={`${id}-title`} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="stack stack-sm">
          <h2 id={`${id}-title`}>
            {mode === 'edit' ? 'Edit' : 'Add'} {label.toLowerCase()}
          </h2>
          <p className="text-muted text-sm">
            {mode === 'edit'
              ? 'This updates your saved profile for every trip.'
              : 'Optional. You can skip it and add it later.'}
          </p>
        </div>
        <div className="field">
          {question === 'tastes' ? (
            <>
              <span className="field-label" id={`${id}-label`}>
                {label}
              </span>
              <div
                className="chipset"
                role="group"
                aria-labelledby={`${id}-label`}
                aria-describedby={describedBy}
                ref={groupRef}
              >
                {TASTES.map((taste) => {
                  const picked = (current as string[]).includes(taste)
                  return (
                    <button
                      key={taste}
                      className="chip"
                      type="button"
                      aria-pressed={picked}
                      onClick={() =>
                        change(
                          picked
                            ? (current as string[]).filter((t) => t !== taste)
                            : [...(current as string[]), taste],
                        )
                      }
                    >
                      {taste}
                    </button>
                  )
                })}
              </div>
              <span className="field-hint" id={`${id}-hint`}>
                Pick all that fit. We use them to suggest places.
              </span>
            </>
          ) : (
            <>
              <label className="field-label" htmlFor={id}>
                {label}
              </label>
              <select
                id={id}
                ref={fieldRef}
                className={`select${error ? ' is-invalid' : ''}`}
                value={current as string}
                onChange={(event) => change(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
              >
                <option value="">{SELECT_QUESTIONS[question].placeholder}</option>
                {/* An older profile may hold a value the list no longer has; keep it selectable. */}
                {[
                  ...new Set([
                    ...SELECT_QUESTIONS[question].options,
                    ...(value && typeof value === 'string' ? [value] : []),
                  ]),
                ].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <span className="field-hint" id={`${id}-hint`}>
                {SELECT_QUESTIONS[question].hint ??
                  (mode === 'edit' ? 'Pick the answer that fits now.' : 'Pick one.')}
              </span>
            </>
          )}
          <FieldError id={`${id}-error`} message={error} />
        </div>
        {failed && (
          <p className="field-error" role="alert">
            We couldn't save that answer. Try again.
          </p>
        )}
        <div className="form-actions">
          {mode === 'edit' && (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={pending}
              onClick={() => {
                setCurrent(empty)
                void save(empty)
              }}
            >
              Clear answer
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? (
              <>
                <span className="spinner" aria-hidden="true" /> Saving
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </form>
    </Overlay>
  )
}
