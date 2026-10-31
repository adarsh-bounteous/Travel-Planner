import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthError, requestEmailChange, requestPasswordChange } from '../auth/api'
import type { AuthErrorCode } from '../auth/api'
import { useAuth } from '../auth/AuthProvider'
import { AlertIcon, ArrowLeftIcon, CheckIcon, EditIcon, ListIcon, PlaneIcon, UserIcon } from '../auth/icons'
import { MESSAGES } from '../auth/messages'

const MIN_PASSWORD_LENGTH = 12

const MISSING_CURRENT = 'Enter your current password to make this change.'
const WRONG_CURRENT = "That password didn't match. Try again."
const PASSWORD_TOO_SHORT =
  'Password is too short. Use at least 12 characters, with a letter and a number.'
const PASSWORD_NEEDS_MIX = 'Password needs a letter and a number. Add both and try again.'
const EMAIL_SAVED = 'Changes saved. Confirm a new email from the link we sent to it.'
const PASSWORD_SAVED = 'Password changed. Use it the next time you sign in.'

type FieldName = 'current' | 'next'
type FieldError = { field: FieldName; text: string }

function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_NEEDS_MIX
  return null
}

/** Where an API error belongs on the form, and what it says. */
function fromApi(code: AuthErrorCode, newPasswordLength: number): FieldError {
  if (code === 'wrong_password') return { field: 'current', text: WRONG_CURRENT }
  if (code === 'password_rule') {
    return {
      field: 'next',
      text: newPasswordLength < MIN_PASSWORD_LENGTH ? PASSWORD_TOO_SHORT : PASSWORD_NEEDS_MIX,
    }
  }
  return { field: 'next', text: MESSAGES[code].text }
}

type ChangeCardProps = {
  id: 'email' | 'password'
  heading: string
  lead?: ReactNode
  nextLabel: string
  nextType: 'email' | 'password'
  nextAutoComplete: 'email' | 'new-password'
  hint: string
  submitLabel: string
  /** Returns a problem to show, or null once the change is saved. */
  onSubmit: (current: string, next: string) => Promise<FieldError | null>
  onSaved: () => void
}

function ChangeCard({
  id,
  heading,
  lead,
  nextLabel,
  nextType,
  nextAutoComplete,
  hint,
  submitLabel,
  onSubmit,
  onSaved,
}: ChangeCardProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<FieldError | null>(null)
  const [pending, setPending] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)

  // Errors show only after submit; move focus to the field that needs fixing.
  useEffect(() => {
    if (error) (error.field === 'current' ? currentRef : nextRef).current?.focus()
  }, [error])

  const currentId = `current-password-${id}`
  const nextId = `new-${id}`
  const errorId = (field: FieldName) => `${id}-${field}-error`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (current === '') {
      setError({ field: 'current', text: MISSING_CURRENT })
      return
    }
    setError(null)
    setPending(true)
    try {
      const problem = await onSubmit(current, next)
      setError(problem)
      if (!problem) {
        if (id === 'password') {
          setCurrent('')
          setNext('')
        }
        onSaved()
      }
    } finally {
      setPending(false)
    }
  }

  const fieldProps = (field: FieldName) => {
    const invalid = error?.field === field
    return {
      className: `input${invalid ? ' is-invalid' : ''}`,
      'aria-invalid': invalid || undefined,
      'aria-describedby': invalid ? errorId(field) : undefined,
    }
  }
  const errorFor = (field: FieldName) =>
    error?.field === field && (
      <p className="field-error cluster" id={errorId(field)} role="alert">
        <AlertIcon />
        <span>{error.text}</span>
      </p>
    )

  return (
    <form className="card stack" noValidate onSubmit={submit}>
      <h3>
        <EditIcon />
        {heading}
      </h3>
      {lead}
      <div className="field">
        <label className="field-label" htmlFor={currentId}>
          Current password
        </label>
        <input
          {...fieldProps('current')}
          ref={currentRef}
          id={currentId}
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        {errorFor('current')}
      </div>
      <div className="field">
        <label className="field-label" htmlFor={nextId}>
          {nextLabel}
        </label>
        <input
          {...fieldProps('next')}
          ref={nextRef}
          id={nextId}
          type={nextType}
          autoComplete={nextAutoComplete}
          placeholder={nextLabel}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <span className="field-hint">{hint}</span>
        {errorFor('next')}
      </div>
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          <CheckIcon />
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" /> Saving
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  )
}

export function AccountPage() {
  const { email, method, signOut } = useAuth()
  const navigate = useNavigate()
  const [saved, setSaved] = useState<string | null>(null)

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in')
  }

  const changeEmail = async (current: string, next: string): Promise<FieldError | null> => {
    setSaved(null)
    try {
      await requestEmailChange(current, next)
      return null
    } catch (error) {
      return fromApi(error instanceof AuthError ? error.code : 'unknown', 0)
    }
  }

  const changePassword = async (current: string, next: string): Promise<FieldError | null> => {
    setSaved(null)
    const problem = passwordProblem(next)
    if (problem) return { field: 'next', text: problem }
    try {
      await requestPasswordChange(current, next)
      return null
    } catch (error) {
      return fromApi(error instanceof AuthError ? error.code : 'unknown', next.length)
    }
  }

  return (
    <div className="col stack">
      <h1>Account</h1>
      <div className="card cluster">
        <Link className="btn btn-secondary" to="/profile">
          <UserIcon />
          Traveller profile
        </Link>
        <Link className="btn btn-secondary" to="/profile/transport">
          <PlaneIcon />
          Transport preferences
        </Link>
        <Link className="btn btn-secondary" to="/account/local-mode">
          <ListIcon />
          Local mode
        </Link>
      </div>
      {method === 'email' && (
        <>
          <ChangeCard
            id="email"
            heading="Email"
            lead={
              <p>
                <span className="text-muted">Your email is </span>
                <strong>{email}</strong>
              </p>
            }
            nextLabel="New email address"
            nextType="email"
            nextAutoComplete="email"
            hint="We'll send a link to this address. Your email changes once you open it."
            submitLabel="Save email"
            onSubmit={changeEmail}
            onSaved={() => setSaved(EMAIL_SAVED)}
          />
          <ChangeCard
            id="password"
            heading="Password"
            nextLabel="New password"
            nextType="password"
            nextAutoComplete="new-password"
            hint="At least 12 characters, with a letter and a number."
            submitLabel="Save password"
            onSubmit={changePassword}
            onSaved={() => setSaved(PASSWORD_SAVED)}
          />
        </>
      )}
      {method === 'google' && <p>You sign in with Google.</p>}
      {saved && (
        <div className="toast-slot">
          <div className="toast is-open" role="status" aria-live="polite">
            <CheckIcon />
            <span>{saved}</span>
          </div>
        </div>
      )}
      <hr className="divider" />
      <div className="signout-row">
        <button className="btn btn-secondary" type="button" onClick={handleSignOut}>
          <ArrowLeftIcon />
          Sign out
        </button>
      </div>
    </div>
  )
}
