/** A decorative bar that fills while something is saving. */
export function ProgressBar({ running = false }: { running?: boolean }) {
  return (
    <div className="progress" aria-hidden="true">
      <div className={`progress-fill${running ? ' is-running' : ''}`} />
    </div>
  )
}
