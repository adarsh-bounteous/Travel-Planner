import { useEffect, useRef } from 'react'
import { PlusIcon, UserIcon, XIcon } from './icons'

type Props = { onSignUp: () => void; onCancel: () => void }

export function GoogleNoAccountModal({ onSignUp, onCancel }: Props) {
  const firstButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    firstButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [onCancel])

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="gna-title">
        <div className="stack">
          <h2 id="gna-title">
            <UserIcon />
            No account yet
          </h2>
          <p>No account is linked to this Google account.</p>
          <p className="text-muted text-sm">
            Sign up to create one, then you can sign in with Google.
          </p>
          <div className="cluster">
            <button ref={firstButton} className="btn btn-primary" type="button" onClick={onSignUp}>
              <PlusIcon />
              Sign up
            </button>
            <button className="btn btn-ghost" type="button" onClick={onCancel}>
              <XIcon />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
