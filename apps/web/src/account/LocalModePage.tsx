import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchLocalMode, LocalModeNotAllowedError, setLocalMode } from '../travel/api'

/** The shared local mode switch. A live deployment refuses On, so the switch stays Off. */
export function LocalModePage() {
  const [on, setOn] = useState<boolean | null>(null)
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    fetchLocalMode().then(
      (mode) => setOn(mode.local_mode),
      () => setOn(false),
    )
  }, [])

  const choose = async (wanted: boolean) => {
    setRefused(false)
    try {
      setOn((await setLocalMode(wanted)).local_mode)
    } catch (error) {
      if (error instanceof LocalModeNotAllowedError) {
        setOn(false)
        setRefused(true)
      }
    }
  }

  if (on === null) return <span className="spinner" role="status" aria-label="Loading" />

  return (
    <div className="inbox-col stack">
      <h1>Local mode</h1>
      <fieldset className="stack stack-sm" aria-describedby="local-mode-hint">
        <legend className="field-label">Use local stand-ins for travel search</legend>
        <label className="check">
          <input
            className="radio"
            type="radio"
            name="local-mode"
            checked={on}
            onChange={() => void choose(true)}
          />
          On
        </label>
        <label className="check">
          <input
            className="radio"
            type="radio"
            name="local-mode"
            checked={!on}
            onChange={() => void choose(false)}
          />
          Off
        </label>
        <span className="field-hint" id="local-mode-hint">
          On: stays, flights and transport are generated locally. Off: results come from the real provider.
        </span>
      </fieldset>
      {refused && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-title">Local mode is not allowed in live deployments.</span> The switch stays
          Off.
        </div>
      )}
      <div className="cluster">
        <Link className="btn btn-secondary" to="/explore/travel">
          Back to search
        </Link>
      </div>
    </div>
  )
}
