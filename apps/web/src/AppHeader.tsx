import { Link, NavLink } from 'react-router'
import { useAuth } from './auth/AuthProvider'

// Minimal header: the App shell story owns the full navigation and signed-in display.
export function AppHeader() {
  const { status } = useAuth()
  return (
    <header className="shell-header">
      <div className="shell-bar">
        <Link className="shell-brand" to="/">
          Travel Planner
        </Link>
        {status === 'signedIn' && (
          <>
            <NavLink className="shell-link" to="/profile">
              Profile
            </NavLink>
            <NavLink className="shell-link" to="/saved">
              Saved
            </NavLink>
            <NavLink className="shell-link" to="/account">
              Account
            </NavLink>
          </>
        )}
        {status === 'signedOut' && (
          <Link className="btn btn-secondary" to="/sign-in">
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
