import { useEffect, useState } from 'react'
import { CheckIcon } from '../auth/icons'

const TOAST_MS = 4000

/** A short confirmation that a change was saved; it hides itself. Give it a new `key` to show it again. */
export function Toast({ message }: { message: string | null }) {
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
        </div>
      )}
    </div>
  )
}
