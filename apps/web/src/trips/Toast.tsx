import { useEffect, useState } from 'react'
import { AlertIcon, CheckIcon, XIcon } from '../auth/icons'

const TOAST_MS = 4000

type ToastProps = {
  message: string | null
  /** An optional action on the toast, such as undoing the change it reports. */
  undo?: () => void
  /** An optional navigation action, such as opening the trip the change was made to. */
  action?: { label: string; onAction: () => void }
  /** 'error' reports a failure (an alert with a danger edge); the default confirms a change. */
  tone?: 'success' | 'error'
  /** Shows a Dismiss button that hides the toast at once. */
  dismissible?: boolean
  /** How long the toast stays before hiding itself, in milliseconds. */
  ms?: number
}

/** A short confirmation that a change was saved; it hides itself. Give it a new `key` to show it again. */
export function Toast({
  message,
  undo,
  action,
  tone = 'success',
  dismissible,
  ms = TOAST_MS,
}: ToastProps) {
  const [visible, setVisible] = useState(true)
  const isError = tone === 'error'

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), ms)
    return () => clearTimeout(timer)
  }, [ms])

  return (
    <div role={isError ? 'alert' : 'status'}>
      {message && visible && (
        <div className={`toast is-open cluster${isError ? ' toast-error' : ''}`}>
          {isError ? <AlertIcon /> : <CheckIcon />}
          <span className="toast-message">{message}</span>
          {undo && (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setVisible(false)
                undo()
              }}
            >
              Undo
            </button>
          )}
          {action && (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setVisible(false)
                action.onAction()
              }}
            >
              {action.label}
            </button>
          )}
          {dismissible && (
            <button
              className="toast-close"
              type="button"
              aria-label="Dismiss"
              onClick={() => setVisible(false)}
            >
              <XIcon />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
