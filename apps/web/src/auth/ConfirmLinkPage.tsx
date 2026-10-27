import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AuthError, requestConfirmLink } from './api'
import { AlertIcon } from './icons'
import { MESSAGES } from './messages'
import type { Problem } from './messages'

type Outcome = 'confirming' | 'confirmed' | Problem

/** Where the confirmation link in the (local) inbox lands: confirms the account, or says why it cannot. */
export function ConfirmLinkPage() {
  const { token = '' } = useParams()
  const [outcome, setOutcome] = useState<Outcome>('confirming')

  useEffect(() => {
    let current = true
    requestConfirmLink(token).then(
      () => current && setOutcome('confirmed'),
      (error) => current && setOutcome(error instanceof AuthError ? error.code : 'unknown'),
    )
    return () => {
      current = false
    }
  }, [token])

  if (outcome === 'confirming') return <span className="spinner" role="status" aria-label="Loading" />

  return (
    <div className="auth stack">
      <div className="card stack center">
        {outcome === 'confirmed' ? (
          <h1>Your email is confirmed</h1>
        ) : (
          <div className={`alert alert-${MESSAGES[outcome].tone} cluster`} role="alert">
            <AlertIcon />
            <span>{MESSAGES[outcome].text}</span>
          </div>
        )}
        {(outcome === 'link_expired' || outcome === 'link_already_used') && (
          <p className="text-muted text-sm">Nothing was changed. Ask for a new email to try again.</p>
        )}
        <Link className="btn btn-secondary" to="/sign-in">
          Sign in
        </Link>
      </div>
    </div>
  )
}
