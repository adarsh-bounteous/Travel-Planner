import { useState } from 'react'
import { EmptyStateArt } from '../components/EmptyStateArt'
import type { FormEvent } from 'react'
import { inviteEditor, revokeEditor } from './api'
import type { Trip } from './api'

type AccessSectionProps = {
  trip: Trip
  onChanged: (trip: Trip, message: string, undo?: () => void) => void
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Owner only: invite companions to edit the plan by email, and revoke their access. */
export function AccessSection({ trip, onChanged }: AccessSectionProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const editors = trip.editors ?? []

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim().toLowerCase()
    if (address === '') return setError('Enter an email address to send the invite.')
    if (!EMAIL.test(address)) return setError('Enter a valid email address, like ana@example.com.')
    if (editors.some((e) => e.email === address))
      return setError(`${address} is already an editor on this trip.`)
    setError(null)
    setPending(true)
    try {
      const updated = await inviteEditor(trip.id, address)
      setEmail('')
      onChanged(updated, `Invite sent to ${address}.`)
    } catch {
      setError("We couldn't send that invite. Try again.")
    } finally {
      setPending(false)
    }
  }

  const revoke = async (address: string) => {
    try {
      const updated = await revokeEditor(trip.id, address)
      // Undo is a fresh invite: the old link stays dead, so they open the new one.
      const undo = async () => {
        try {
          onChanged(await inviteEditor(trip.id, address), `Invite sent to ${address}.`)
        } catch {
          onChanged(updated, "We couldn't bring that editor back. Invite them again.")
        }
      }
      onChanged(updated, `Access revoked for ${address}. The trip is no longer shown to them.`, undo)
    } catch {
      setError(`We couldn't revoke access for ${address}. Try again.`)
    }
  }

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <h3 className="text-lg">Editors</h3>
        <p className="text-muted">
          Editors can change the plan. They can't invite people or manage access.
        </p>
      </div>
      <form className="form-row" onSubmit={submit} noValidate>
        <div className={`field${error ? ' is-invalid' : ''}`}>
          <label className="field-label" htmlFor="invite-email">
            Email to invite as editor
          </label>
          <input
            id="invite-email"
            className={`input${error ? ' is-invalid' : ''}`}
            type="email"
            autoComplete="off"
            placeholder="Email to invite as editor"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'invite-email-error' : 'invite-email-hint'}
          />
          <span className="field-hint" id="invite-email-hint">
            They need to sign in with this email to open the trip.
          </span>
          {error && (
            <div className="field-error" id="invite-email-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite editor'}
        </button>
      </form>
      <div className="stack stack-sm">
        {editors.length === 0 ? (
          <div className="empty-state">
            <EmptyStateArt />
            <p>No editors yet. Invite a companion by email to plan together.</p>
          </div>
        ) : (
          editors.map((editor) => (
            <div className="editor-row" key={editor.email}>
              <span className="editor-who">
                <span>{editor.email}</span>
                <span className={`badge ${editor.accepted ? 'badge-success' : 'badge-warning'}`}>
                  {editor.accepted ? 'Editor' : 'Invited'}
                </span>
                {!editor.accepted && editor.invite_url && (
                  <span className="note-for">
                    Invite link: {window.location.origin}
                    {editor.invite_url}
                  </span>
                )}
              </span>
              <button
                className="btn btn-ghost"
                type="button"
                aria-label={`Revoke access for ${editor.email}`}
                onClick={() => revoke(editor.email)}
              >
                Revoke access
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
