import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { fetchGoogleIdentities, finishGoogle, type GoogleIdentity } from './api'
import { AlertIcon, CheckIcon, UserIcon, XIcon } from './icons'

const EMAIL = /^\S+@\S+\.\S+$/

export function GoogleConsentPage() {
  const [params] = useSearchParams()
  const state = params.get('state')
  const [identities, setIdentities] = useState<GoogleIdentity[]>([])
  const [selected, setSelected] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const summary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchGoogleIdentities().then(setIdentities)
  }, [])

  useEffect(() => {
    if (error) summary.current?.focus()
  }, [error])

  function choose(email: string) {
    setSelected(email)
    setTyped('')
    setError('')
  }

  function type(value: string) {
    setTyped(value)
    setSelected('')
  }

  function allow(event: FormEvent) {
    event.preventDefault()
    if (!state) return
    const email = (selected || typed).trim()
    if (!email) return setError('Choose an identity or enter an email address.')
    if (!EMAIL.test(email)) return setError('Enter a valid email address.')
    setPending(true)
    finishGoogle(state, { email })
  }

  function cancel() {
    if (!state) return
    setPending(true)
    finishGoogle(state, 'cancel')
  }

  return (
    <div className="consent-col">
      <form className="card consent-card stack" onSubmit={allow} noValidate>
        <div className="consent-head">
          <h2>
            <UserIcon />
            Choose an account
          </h2>
          <span className="badge badge-warning">
            <AlertIcon />
            Local only
          </span>
        </div>
        {!state && (
          <div className="alert alert-danger" role="alert">
            <AlertIcon />
            <span>This page needs to be opened from Continue with Google.</span>
          </div>
        )}
        {error ? (
          <div ref={summary} className="alert alert-danger" role="alert" tabIndex={-1}>
            <AlertIcon />
            <span className="alert-title">You're not signed in.</span>{' '}
            <span>Fix the email address and choose Allow again.</span>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Travel Planner wants to sign you in with Google. Pick an identity or type an email address.
          </p>
        )}
        <fieldset className="identities">
          <legend>Known identities</legend>
          {identities.map((identity) => (
            <label className="identity" key={identity.email}>
              <input
                className="radio"
                type="radio"
                name="identity"
                value={identity.email}
                checked={selected === identity.email}
                onChange={() => choose(identity.email)}
              />
              <span className="identity-main">{identity.email}</span>
              {identity.has_account ? (
                <span className="badge badge-success">
                  <CheckIcon />
                  Has account
                </span>
              ) : (
                <span className="badge badge-neutral">No account yet</span>
              )}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label className="field-label" htmlFor="consent-email">
            Or type an email address
          </label>
          <input
            className={`input${error ? ' is-invalid' : ''}`}
            id="consent-email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={typed}
            onChange={(event) => type(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'consent-email-error' : 'consent-email-hint'}
          />
          {error ? (
            <span className="field-error" id="consent-email-error">
              <AlertIcon />
              {error}
            </span>
          ) : (
            <span className="field-hint" id="consent-email-hint">
              Any email linked to an account signs you in as that account.
            </span>
          )}
        </div>
        <div className="consent-actions">
          <button className="btn btn-secondary" type="button" onClick={cancel} disabled={pending}>
            <XIcon />
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending || !state}>
            <CheckIcon />
            {pending ? 'Working…' : 'Allow'}
          </button>
        </div>
      </form>
    </div>
  )
}
