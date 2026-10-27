import { useEffect, useState } from 'react'
import { fetchLocalMode } from '../auth/api'
import { AlertIcon } from '../auth/icons'
import { LocalModeError, requestLocalMode } from './api'

const REFUSED_TITLE = 'Local mode is not allowed in live deployments'
const REFUSED_BODY =
  'This is a live deployment, so the switch stays Off. Use a local or test deployment to turn it on.'
const UNKNOWN_ERROR = "We couldn't change local mode. Try again."

const OPTIONS = [
  { id: 'on', label: 'On', value: true },
  { id: 'off', label: 'Off', value: false },
] as const

export function SettingsPage() {
  const [localMode, setLocalMode] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<'refused' | 'unknown' | null>(null)

  useEffect(() => {
    let current = true
    void fetchLocalMode().then((on) => current && setLocalMode(on))
    return () => {
      current = false
    }
  }, [])

  const choose = async (on: boolean) => {
    setError(null)
    setPending(true)
    try {
      setLocalMode(await requestLocalMode(on))
    } catch (failure) {
      // A refused or failed change leaves the switch as it was.
      setError(
        failure instanceof LocalModeError && failure.code === 'local_mode_not_allowed'
          ? 'refused'
          : 'unknown',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="col stack">
      <h1>Settings</h1>
      {error === 'refused' && (
        <div className="toast-slot">
          <div className="toast is-open" role="status" aria-live="polite">
            <AlertIcon />
            <span>{REFUSED_TITLE}</span>
          </div>
        </div>
      )}
      <fieldset className="radio-group" disabled={pending} aria-describedby="local-mode-hint">
        <legend>Local mode</legend>
        {OPTIONS.map((option) => (
          <label key={option.id} className="check">
            <input
              className={`radio${error === 'refused' && option.value ? ' is-invalid' : ''}`}
              type="radio"
              name="local-mode"
              value={option.id}
              checked={localMode === option.value}
              onChange={() => void choose(option.value)}
            />
            {option.label}
          </label>
        ))}
        <span className="field-hint" id="local-mode-hint">
          Use generated places and other stand-ins instead of outside services.
        </span>
      </fieldset>
      {error === 'refused' && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-title">{REFUSED_TITLE}</span> {REFUSED_BODY}
        </div>
      )}
      {error === 'unknown' && (
        <p className="alert alert-danger" role="alert">
          {UNKNOWN_ERROR}
        </p>
      )}
    </div>
  )
}
