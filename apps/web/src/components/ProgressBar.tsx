/** A thin bar that fills while an option is being saved; decorative, so it carries no text. */
export function ProgressBar({ running }: { running: boolean }) {
  return (
    <div className="progress" aria-hidden="true">
      <div className={`progress-fill${running ? ' is-running' : ''}`} />
    </div>
  )
}
