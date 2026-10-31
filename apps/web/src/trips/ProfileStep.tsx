import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertIcon, ArrowRightIcon, InfoIcon, XIcon } from '../auth/icons'
import { FieldError } from './FieldError'
import type { Profile } from './api'
import {
  OPTIONAL_QUESTIONS,
  REQUIRED_QUESTIONS,
  SELECT_QUESTIONS,
  TASTES,
  requiredErrors,
  unansweredQuestions,
} from './profileQuestions'
import type { ProfileAnswers, ProfileQuestionKey } from './profileQuestions'

type Props = {
  saved: Profile
  answers: ProfileAnswers
  onAnswers: (answers: ProfileAnswers) => void
  onContinue: () => void
  onLeave: () => void
}

/** First set-up step: only the profile questions with no saved answer. Nothing is saved here. */
export function ProfileStep({ saved, answers, onAnswers, onContinue, onLeave }: Props) {
  const [blocked, setBlocked] = useState(0)
  const summary = useRef<HTMLDivElement>(null)
  const open = unansweredQuestions(saved)
  const asked = (key: ProfileQuestionKey) => open.includes(key)
  const requiredAsked = REQUIRED_QUESTIONS.filter(asked)
  const optionalAsked = OPTIONAL_QUESTIONS.filter(asked)
  const hasOptional = optionalAsked.length > 0

  // Errors appear after the first Continue, then follow the inputs.
  const errors = blocked > 0 ? requiredErrors(saved, answers) : {}
  const invalid = REQUIRED_QUESTIONS.filter((key) => errors[key])
  const tastes = (answers.tastes as string[] | undefined) ?? []

  useEffect(() => {
    if (blocked > 0) summary.current?.focus()
  }, [blocked])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (Object.keys(requiredErrors(saved, answers)).length > 0) {
      setBlocked((n) => n + 1)
      return
    }
    onContinue()
  }

  const toggleTaste = (taste: string) =>
    onAnswers({
      ...answers,
      tastes: tastes.includes(taste) ? tastes.filter((t) => t !== taste) : [...tastes, taste],
    })

  const select = (key: Exclude<ProfileQuestionKey, 'tastes'>) => {
    const { label, hint, placeholder, options } = SELECT_QUESTIONS[key]
    const error = errors[key as 'citizenship' | 'residence']
    const describedBy = error ? `q-${key}-e` : hint ? `q-${key}-h` : undefined
    return (
      <div className="field" key={key}>
        <label className="field-label" htmlFor={`q-${key}`}>
          {label}
        </label>
        <select
          className={`select ${error ? 'is-invalid' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          id={`q-${key}`}
          value={(answers[key] as string | undefined) ?? ''}
          onChange={(event) => onAnswers({ ...answers, [key]: event.target.value })}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        {hint && (
          <span className="field-hint" id={`q-${key}-h`}>
            {hint}
          </span>
        )}
        <FieldError id={`q-${key}-e`} message={error} />
      </div>
    )
  }

  return (
    <>
      <div className="stack stack-sm">
        <h1>Your profile</h1>
        <p className="text-muted">
          A few questions so we can tailor visas, food and places. We only ask once.
        </p>
      </div>
      {invalid.length > 0 && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={summary}>
          <p className="alert-title">Continue isn't ready yet.</p>
          <ul className="summary-list">
            {invalid.map((key) => (
              <li key={key}>
                {SELECT_QUESTIONS[key].label}: {errors[key]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {open.length === 0 && (
        <div className="alert alert-info">
          <p className="alert-title">Your profile is already saved.</p>
          <p>
            We have everything we need, so there's nothing to answer here. Continue to your trip
            details.
          </p>
        </div>
      )}
      <form className="stack stack-lg" noValidate onSubmit={submit}>
        {requiredAsked.length > 0 && (
          <section className="group">
            <h2>
              <AlertIcon />
              Required
            </h2>
            {requiredAsked.map(select)}
          </section>
        )}
        {hasOptional && (
          <section className="group">
            <div>
              <h2>
                <InfoIcon />
                Optional
              </h2>
              <p className="text-muted text-sm">
                Skip any you like. We'll ask again on your next trip.
              </p>
            </div>
            {optionalAsked.map((key) =>
              key === 'tastes' ? (
                <fieldset className="field" key={key}>
                  <legend className="field-label">Tastes</legend>
                  <div className="checks">
                    {TASTES.map((taste) => (
                      <label className="check" key={taste}>
                        <input
                          className="checkbox"
                          type="checkbox"
                          checked={tastes.includes(taste)}
                          onChange={() => toggleTaste(taste)}
                        />
                        {taste}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                select(key)
              ),
            )}
          </section>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={onLeave}>
            <XIcon />
            Leave set-up
          </button>
          <button className="btn btn-primary" type="submit">
            <ArrowRightIcon />
            Continue
          </button>
        </div>
      </form>
    </>
  )
}
