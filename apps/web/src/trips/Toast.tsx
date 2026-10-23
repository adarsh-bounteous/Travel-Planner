import { useEffect, useState } from 'react'
import { CheckIcon } from '../auth/icons'

const TOAST_MS = 4000

type ToastProps = {
  message: string | null
  /** An optional action on the toast, such as undoing the change it reports. */
  undo?: () => void
}

/** A short confirmation that a change was saved; it hides itself. Give it a new `key` to show it again. */
export function Toast({ message, undo }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), TOAST_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div role="status">
      {message && visible && (
        <div className="toast is-open cluster">
          <CheckIcon />
          <span>{message}</span>
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
        </div>
      )}
    </div>
  )
}
