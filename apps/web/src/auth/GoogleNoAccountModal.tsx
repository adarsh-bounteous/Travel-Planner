import { useEffect, useRef } from 'react'
import { useExit } from '../motion'

type Props = { onSignUp: () => void; onCancel: () => void }

export function GoogleNoAccountModal({ onSignUp, onCancel }: Props) {
  const firstButton = useRef<HTMLButtonElement>(null)
  const exit = useExit(onCancel)
  const { start } = exit
  const motion = exit.leaving ? 'is-leaving' : 'is-entering'

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    firstButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') start()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [start])

  return (
    <>
      <div className={`backdrop ${motion}`} aria-hidden="true" />
      <div
        className={`modal ${motion}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) exit.onAnimationEnd()
        }}
        role="dialog" aria-modal="true" aria-labelledby="gna-title">
        <div className="stack">
          <h2 id="gna-title">No account yet</h2>
          <p>No account is linked to this Google account.</p>
          <p className="text-muted text-sm">
            Sign up to create one, then you can sign in with Google.
          </p>
          <div className="cluster">
            <button ref={firstButton} className="btn btn-primary" type="button" onClick={onSignUp}>
              Sign up
            </button>
            <button className="btn btn-ghost" type="button" onClick={start}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
