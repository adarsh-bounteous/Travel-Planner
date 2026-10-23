import { Link } from 'react-router'
import { BellIcon } from './icons'

export function ConfirmEmailPage() {
  return (
    <div className="auth stack">
      <div className="card stack center">
        <div className="mailmark" aria-hidden="true">
          <BellIcon />
        </div>
        <h1>Confirm your email</h1>
        <p>Open the link we sent to your email address, then sign in.</p>
        <Link className="btn btn-secondary" to="/sign-in">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
