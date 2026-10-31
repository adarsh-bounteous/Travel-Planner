import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { startGoogle } from './api'
import type { GoogleMode } from './api'
import { AlertIcon, ArrowRightIcon, InfoIcon, RefreshIcon, UserIcon } from './icons'
import { MESSAGES } from './messages'
import type { Problem } from './messages'
import { PasswordField } from './PasswordField'

export const ALERT_ID = 'auth-alert'

type Props = {
  mode: GoogleMode
  title: string
  primaryLabel: string
  googleLabel: string
  passwordPlaceholder: string
  passwordHint?: ReactNode
  /** Hides the footer link, the Google button and the sign-up link: used when arriving from an invite. */
  noSignUp?: boolean
  footer?: { prompt: string; linkLabel: string; to: string }
  problem: Problem | null
  email: string
  onEmailChange: (value: string) => void
  pending: boolean
  onSubmit: (email: string, password: string) => void
  onResend?: () => void
  resent?: boolean
  /** Shown above the form. A function receives a setter for the password field. */
  notice?: ReactNode | ((fillPassword: (value: string) => void) => ReactNode)
}

const EMAIL_PROBLEMS: Problem[] = ['no_account', 'could_not_create', 'email_not_confirmed']
const PASSWORD_PROBLEMS: Problem[] = ['wrong_password', 'password_rule']

export function AuthForm(props: Props) {
  const { mode, problem, email, pending } = props
  const [password, setPassword] = useState('')
  const [waitingForGoogle, setWaitingForGoogle] = useState(false)
  const message = problem ? MESSAGES[problem] : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    props.onSubmit(email.trim(), password)
  }

  const google = () => {
    setWaitingForGoogle(true)
    startGoogle(mode)
  }

  return (
    <div className="auth stack">
      {typeof props.notice === 'function' ? props.notice(setPassword) : props.notice}
      {message && (
        <div
          id={ALERT_ID}
          className={`alert alert-${message.tone} cluster`}
          role="alert"
        >
          {message.tone === 'danger' ? <AlertIcon /> : <InfoIcon />}
          <span>
            {message.text}
            {problem === 'no_account' && !props.noSignUp && (
              <>
                {' '}
                <Link to="/sign-up">Sign up</Link>.
              </>
            )}
            {problem === 'email_not_confirmed' && props.onResend && (
              <>
                {' '}
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={props.onResend}
                  disabled={props.resent}
                >
                  <RefreshIcon />
                  {props.resent ? 'Email sent' : 'Resend email'}
                </button>
              </>
            )}
          </span>
        </div>
      )}
      <form className="card stack" onSubmit={submit} noValidate>
        <h1>{props.title}</h1>
        <div className={`field${problem && EMAIL_PROBLEMS.includes(problem) ? ' is-invalid' : ''}`}>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => props.onEmailChange(event.target.value)}
            aria-invalid={problem === 'no_account' || problem === 'could_not_create' || undefined}
            aria-describedby={
              problem === 'no_account' || problem === 'could_not_create' ? ALERT_ID : undefined
            }
          />
        </div>
        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder={props.passwordPlaceholder}
          invalid={problem !== null && PASSWORD_PROBLEMS.includes(problem)}
          describedBy={ALERT_ID}
          hint={props.passwordHint}
        />
        <button className="btn btn-primary fill" type="submit" disabled={pending}>
          <ArrowRightIcon />
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Please wait
            </>
          ) : (
            props.primaryLabel
          )}
        </button>
        {!props.noSignUp && (
          <>
            <p className="or text-sm text-muted" aria-hidden="true">
              or
            </p>
            <button
              className="btn btn-secondary fill"
              type="button"
              onClick={google}
              disabled={waitingForGoogle}
            >
              <UserIcon />
              {waitingForGoogle ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Waiting for Google
                </>
              ) : (
                <>
                  <span className="gmark" aria-hidden="true">
                    G
                  </span>
                  {props.googleLabel}
                </>
              )}
            </button>
          </>
        )}
        {props.footer && !props.noSignUp && (
          <p className="cluster center">
            <span className="text-muted">{props.footer.prompt}</span>
            <Link to={props.footer.to}>{props.footer.linkLabel}</Link>
          </p>
        )}
      </form>
    </div>
  )
}
