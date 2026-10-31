import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { fetchLocalMode, requestResetLocalData } from '../auth/api'
import { useAuth } from '../auth/AuthProvider'
import { AlertIcon, ListIcon, RefreshIcon, TrashIcon, XIcon } from '../auth/icons'
import { Overlay } from '../trips/Overlay'

/** The Menu drawer. Its developer tools, and the reset confirmation, exist only while local sign-in is on. */
export function LocalMenu({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [localMode, setLocalMode] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    void fetchLocalMode().then((on) => current && setLocalMode(on))
    return () => {
      current = false
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in')
  }

  const reset = async () => {
    setFailed(false)
    setPending(true)
    try {
      await requestResetLocalData()
    } catch {
      setFailed(true)
      setPending(false)
      return
    }
    // The sign-in page finishes the sign-out: signing out here would let RequireAuth redirect without the toast.
    navigate('/sign-in', { state: { localReset: true } })
  }

  return (
    <>
      <Overlay kind="drawer" labelledBy="menu-title" covered={confirming} onClose={onClose}>
        <div className="stack">
          <div className="between">
            <h2 id="menu-title">
              <ListIcon />
              Menu
            </h2>
            <button className="btn btn-ghost btn-icon" type="button" aria-label="Close menu" onClick={onClose}>
              <XIcon />
            </button>
          </div>
          <ul className="menu">
            <li>
              <Link className="menu-item" to="/">
                Trips
              </Link>
            </li>
            <li>
              <Link className="menu-item" to="/account">
                Account
              </Link>
            </li>
            {localMode && (
              <li>
                <Link className="menu-item between" to="/local/inbox" onClick={onClose}>
                  Local inbox <span className="badge badge-neutral">Testing</span>
                </Link>
              </li>
            )}
            <li>
              <button className="menu-item" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </li>
          </ul>
          {localMode && (
            <>
              <hr className="divider" />
              <p className="text-sm text-muted">
                Developer tools. Visible only while local sign-in is on.
              </p>
              <button className="btn btn-secondary" type="button" onClick={() => setConfirming(true)}>
                <RefreshIcon />
                Reset local data
              </button>
            </>
          )}
        </div>
      </Overlay>
      {confirming && (
        <Overlay
          kind="modal"
          role="alertdialog"
          labelledBy="reset-local-title"
          describedBy="reset-local-text"
          onClose={() => setConfirming(false)}
        >
          <div className="stack stack-lg">
            <h2 id="reset-local-title">
              <RefreshIcon />
              Reset local data
            </h2>
            <p id="reset-local-text">
              All local accounts and sessions will be deleted. Sample data will be restored.
            </p>
            {failed && (
              <p className="alert alert-danger cluster" role="alert">
                <AlertIcon />
                <span>Could not reset local data. Try again.</span>
              </p>
            )}
            <div className="overlay-actions end">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirming(false)}>
                <XIcon />
                Cancel
              </button>
              <button className="btn btn-danger" type="button" disabled={pending} onClick={reset}>
                <TrashIcon />
                {pending ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  )
}
