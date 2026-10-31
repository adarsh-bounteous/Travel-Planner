import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchLocalMode } from './api'
import { ArrowLeftIcon, BellIcon } from './icons'

export function ConfirmEmailPage() {
  const [localMode, setLocalMode] = useState(false)

  useEffect(() => {
    let current = true
    void fetchLocalMode().then((on) => current && setLocalMode(on))
    return () => {
      current = false
    }
  }, [])

  return (
    <div className="auth stack">
      <div className="card stack center">
        <div className="mailmark" aria-hidden="true">
          <BellIcon />
        </div>
        <h1>Confirm your email</h1>
        <p>Open the link we sent to your email address, then sign in.</p>
        <Link className="btn btn-secondary" to="/sign-in">
          <ArrowLeftIcon />
          Back to sign in
        </Link>
        {localMode && (
          <p className="text-sm text-muted">
            Testing locally? <Link to="/local/inbox">Local inbox</Link>
          </p>
        )}
      </div>
    </div>
  )
}
