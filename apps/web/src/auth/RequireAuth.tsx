import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from './AuthProvider'
import { InfoIcon } from './icons'
import { pageLabel, peekReturnTo, rememberReturnTo, takeReturnTo } from './returnTo'

// Wrap every protected route. Renders nothing protected until the traveller is known to be signed in.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const here = location.pathname + location.search

  useEffect(() => {
    if (status === 'signedOut') {
      rememberReturnTo(here)
      navigate('/sign-in', { replace: true })
    } else if (status === 'signedIn') {
      // Landing back from Google (or sign-in) with a page that was asked for.
      const pending = takeReturnTo()
      if (pending && pending !== here) navigate(pending, { replace: true })
    }
  }, [status, here, navigate])

  if (status === 'loading') return <span className="spinner" role="status" aria-label="Loading" />

  if (status === 'signedOut') {
    return (
      <div className="auth stack">
        <div className="alert alert-info cluster" role="status">
          <InfoIcon />
          <span>Sign in to continue. We'll bring you back to {pageLabel(here)} afterwards.</span>
        </div>
        <p className="cluster center">
          <span className="spinner" aria-hidden="true" />
          <span className="text-muted">Taking you to sign in…</span>
        </p>
        <p className="center cluster">
          <Link to="/sign-in">Continue to sign in</Link>
        </p>
      </div>
    )
  }

  const pending = peekReturnTo()
  return pending && pending !== here ? null : <>{children}</>
}
