import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, RefreshIcon, UserIcon, UsersIcon } from '../auth/icons'
import { rememberReturnTo, takeReturnTo } from '../auth/returnTo'
import { acceptInvite, fetchInvite, InviteUsedError } from './api'
import type { Invite } from './api'

type Load = { state: 'loading' } | { state: 'invalid' } | { state: 'used' } | { state: 'ready'; invite: Invite }

/** Public page behind an editor invite link. It offers sign-in only, never sign-up. */
export function InvitePage() {
  const { token = '' } = useParams()
  const { status, email, signOut } = useAuth()
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState<'used' | 'failed' | null>(null)

  useEffect(() => {
    fetchInvite(token).then(
      (invite) => setLoad({ state: 'ready', invite }),
      (error) => setLoad({ state: error instanceof InviteUsedError ? 'used' : 'invalid' }),
    )
  }, [token])

  // Back from signing in: this page is the destination, so the remembered path is spent.
  useEffect(() => {
    if (status === 'signedIn') takeReturnTo()
  }, [status])

  const signIn = () => {
    rememberReturnTo(`/invite/${token}`)
    navigate('/sign-in')
  }
  const switchAccount = async () => {
    await signOut()
    signIn()
  }
  const open = async () => {
    setPending(true)
    setFailed(null)
    try {
      const { trip_id } = await acceptInvite(token)
      navigate(`/trips/${encodeURIComponent(trip_id)}`)
    } catch (error) {
      setFailed(error instanceof InviteUsedError ? 'used' : 'failed')
      setPending(false)
    }
  }

  if (load.state === 'loading' || status === 'loading')
    return <span className="spinner" role="status" aria-label="Loading" />

  if (load.state === 'invalid' || load.state === 'used')
    return (
      <div className="stack stack-lg narrow">
        <h2>
          <UsersIcon />
          Trip invite
        </h2>
        <div className="empty-state">
          <AlertIcon />
          <h3>This link has already been used or has expired.</h3>
          <p>Nothing was changed. Ask the trip owner to send a new invite.</p>
          {status === 'signedIn' && (
            <Link to="/">
              <ArrowLeftIcon />
              Back to your trips
            </Link>
          )}
        </div>
      </div>
    )

  const { invite } = load
  const mine = status === 'signedIn' && email?.toLowerCase() === invite.email

  return (
    <div className="stack stack-lg narrow">
      <h2>
        <UsersIcon />
        Trip invite
      </h2>
      {status === 'signedOut' && (
        <div className="card stack stack-sm">
          <p>
            Sign in with <strong>{invite.email}</strong> to open this trip.
          </p>
          <p className="note-for">You've been invited to edit {invite.trip_name}.</p>
          <div className="overlay-actions">
            <button className="btn btn-primary" type="button" onClick={signIn}>
              <UserIcon />
              Sign in
            </button>
          </div>
        </div>
      )}
      {mine && (
        <div className="card stack stack-sm">
          <p>You are invited to edit this trip.</p>
          <p className="note-for">
            Signed in as {email}. You'll be able to change the plan, not who has access.
          </p>
          {failed && (
            <p className="field-error" role="alert">
              {failed === 'used'
                ? 'This invite has already been used.'
                : "We couldn't open the trip. Try again."}
            </p>
          )}
          <div className="overlay-actions">
            <button className="btn btn-primary" type="button" disabled={pending} onClick={open}>
              <ArrowRightIcon />
              Open trip
            </button>
          </div>
        </div>
      )}
      {status === 'signedIn' && !mine && (
        <>
          <div className="empty-state" role="alert">
            <AlertIcon />
            <h3>Access refused</h3>
            <p>
              You're signed in as {email}, but this invite is for {invite.email}.
            </p>
            <p className="note-for">Switch to the invited account to open the trip.</p>
          </div>
          <div className="overlay-actions">
            <button className="btn btn-secondary" type="button" onClick={switchAccount}>
              <RefreshIcon />
              Switch account
            </button>
          </div>
        </>
      )}
    </div>
  )
}
