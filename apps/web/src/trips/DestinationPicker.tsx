import { useState } from 'react'
import { AlertIcon, CheckIcon } from '../auth/icons'
import { matchDestination } from '../places/api'
import type { DestinationMatch } from '../places/api'
import { useDestinationSearch } from '../places/useDestinationSearch'
import { FieldError } from './FieldError'

type DestinationPickerProps = {
  idPrefix: string
  /** Stored "Place, Country", or "" when nothing is chosen. */
  value: string
  /** Called with "" while nothing is chosen. A live place also passes its signed ref. */
  onChange: (destination: string, placeRef?: string) => void
  error?: string
}

export const HINT_LIVE = 'Search any city or town. Try “Agra”.'
export const HINT_LIVE_OFF = 'Live places are off. Only starter destinations are searched.'
export const NOTE_LIVE_UNAVAILABLE =
  'Live results are unavailable right now; showing starter destinations only.'
const FAILED = 'We couldn’t search right now. Try again in a moment.'

/** Starter places first, then live ones, whatever order they arrived in. */
export const starterFirst = (matches: DestinationMatch[]) => [
  ...matches.filter((m) => m.kind === 'starter'),
  ...matches.filter((m) => m.kind === 'live'),
]

/** One searchable destination picker for every place a destination is chosen. */
export function DestinationPicker({ idPrefix, value, onChange, error }: DestinationPickerProps) {
  const [text, setText] = useState(value)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const settled = value !== '' && text === value && selectedId === null
  const { status, result } = useDestinationSearch(settled ? '' : text)

  const inputId = `${idPrefix}-destination`
  const hintId = `${idPrefix}-destination-h`
  const errorId = `${idPrefix}-destination-e`
  const unavailable = status === 'done' && result?.unavailable === true
  const liveOff = status === 'done' && result?.live === false
  const matches = status === 'done' && result ? starterFirst(result.matches) : []

  const choose = (match: DestinationMatch) => {
    setSelectedId(match.id)
    onChange(matchDestination(match), match.kind === 'live' ? match.id : undefined)
  }
  const type = (next: string) => {
    setText(next)
    setSelectedId(null)
    onChange('')
  }

  return (
    <section className="card stack" data-wf-id="destination-picker">
      <div className={`field${error ? ' is-invalid' : ''}`}>
        <label className="field-label" id={`${idPrefix}-destination-l`} htmlFor={inputId}>
          Destination
        </label>
        <input
          className={`input${error ? ' is-invalid' : ''}`}
          id={inputId}
          type="search"
          placeholder="Type a city or town"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          onChange={(event) => type(event.target.value)}
        />
        {unavailable ? (
          <p className="field-hint cluster" id={hintId} role="status">
            <AlertIcon />
            <span>{NOTE_LIVE_UNAVAILABLE}</span>
          </p>
        ) : (
          <p className="field-hint" id={hintId}>
            {liveOff ? HINT_LIVE_OFF : HINT_LIVE}
          </p>
        )}
        <FieldError id={errorId} message={error} />
      </div>
      {status === 'searching' && (
        <div className="stack" aria-hidden="true">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      )}
      <div aria-live="polite">
        {status === 'failed' && <p className="field-hint">{FAILED}</p>}
        {status === 'done' && matches.length === 0 && (
          <p className="field-hint">No places match “{text.trim()}”. Try another spelling.</p>
        )}
        {matches.length > 0 && (
          <ul className="place-pick-list">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="place-pick"
                  aria-pressed={selectedId === m.id}
                  onClick={() => choose(m)}
                >
                  <span className="place-pick-main">
                    <span className="place-pick-name">{m.name}</span>
                    <span className="text-sm text-muted">{m.region}</span>
                  </span>
                  {m.fullGuide && (
                    <span className="badge badge-success">
                      <CheckIcon />
                      Full guide
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value !== '' && (
        <p className="text-sm">
          Chosen: <strong>{value}</strong>
        </p>
      )}
    </section>
  )
}
