import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertIcon, CheckIcon, ChevronDownIcon, XIcon } from '../auth/icons'
import { evaluateDestination, formatDestination, parseDestination } from '../places/destinationMatch'
import type { Catalogue, Choice } from '../places/destinationMatch'
import { fetchStarterDestinations } from '../places/starterApi'
import { FieldError } from './FieldError'

type DestinationPickerProps = {
  idPrefix: string
  /** Stored "Place, Country", or "" when nothing is chosen. */
  value: string
  /** Called with "" while the country or the place is missing. */
  onChange: (destination: string) => void
  error?: string
}

const PLACEHOLDER = 'Type or pick a destination'
const NO_MATCH =
  'No country or place matches what you typed. Pick a country below, or try another spelling.'
const PAUSE_MS = 500

/** Destination dropdown (search or pick) plus Country and Place selects, shared by create and edit. */
export function DestinationPicker({ idPrefix, value, onChange, error }: DestinationPickerProps) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [failed, setFailed] = useState(false)
  const [country, setCountry] = useState('')
  const [place, setPlace] = useState('')
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestion, setSuggestion] = useState<Choice | null>(null)
  const [noMatch, setNoMatch] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const valueAtLoad = useRef(value)

  useEffect(() => {
    fetchStarterDestinations()
      .then((loaded) => {
        const choice = parseDestination(valueAtLoad.current, loaded)
        setCountry(choice?.country ?? '')
        setPlace(choice?.place ?? '')
        setCatalogue(loaded)
      })
      .catch(() => setFailed(true))
  }, [])

  const places = catalogue?.find((c) => c.name === country)?.places ?? []
  const all = (catalogue ?? []).flatMap((c) => c.places.map((p) => ({ country: c.name, place: p })))
  const needle = query.trim().toLowerCase()
  const hits = all.filter(
    (h) =>
      !needle || h.place.toLowerCase().includes(needle) || h.country.toLowerCase().includes(needle),
  )

  const clearFeedback = () => {
    setSuggestion(null)
    setNoMatch(false)
  }
  const choose = (next: Choice) => {
    clearFeedback()
    setTyped('')
    setCountry(next.country)
    setPlace(next.place)
    onChange(formatDestination(next))
  }
  const evaluate = (text: string) => {
    clearFeedback()
    if (!catalogue) return
    const result = evaluateDestination(text, catalogue)
    if (result.kind === 'empty') return
    setTyped(text.trim())
    if (result.kind === 'place') choose(result.choice)
    else if (result.kind === 'country') {
      setCountry(result.country)
      setPlace('')
      onChange('')
    } else if (result.kind === 'near') setSuggestion(result.choice)
    else setNoMatch(true)
  }
  const close = (focusTrigger = false) => {
    setOpen(false)
    setQuery('')
    if (focusTrigger) trigger.current?.focus()
  }
  const submitSearch = () => {
    evaluate(query)
    close(true)
  }

  // A pause with nothing left in the list evaluates what was typed.
  useEffect(() => {
    if (!open || !query.trim() || hits.length > 0) return
    const timer = setTimeout(submitSearch, PAUSE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, hits.length])

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  const onSearchKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitSearch()
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      close(true)
    }
  }

  const changeCountry = (next: string) => {
    clearFeedback()
    setTyped('')
    setCountry(next)
    setPlace('')
    onChange('')
  }
  const changePlace = (next: string) => {
    clearFeedback()
    setTyped('')
    setPlace(next)
    if (next) onChange(formatDestination({ country, place: next }))
    else onChange('')
  }

  if (failed)
    return (
      <p className="alert alert-danger" role="alert">
        We couldn't load the destinations. Reload to try again.
      </p>
    )
  if (!catalogue)
    return (
      <div className="stack stack-sm" aria-busy="true">
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    )

  const invalid = Boolean(error) || noMatch
  const label = place ? formatDestination({ country, place }) : typed
  const hintId = `${idPrefix}-destination-h`

  return (
    <div className="stack stack-lg">
      <div className={`field${invalid ? ' is-invalid' : ''}`}>
        <span className="field-label" id={`${idPrefix}-destination-l`}>
          Destination
        </span>
        <div className="dest" ref={root}>
          <button
            ref={trigger}
            type="button"
            id={`${idPrefix}-destination`}
            className={`select dest-trigger${invalid ? ' is-invalid' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby={`${idPrefix}-destination-l`}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={error ? `${idPrefix}-destination-e` : hintId}
            onClick={() => (open ? close() : setOpen(true))}
          >
            <span className={`dest-label${label ? '' : ' text-muted'}`}>{label || PLACEHOLDER}</span>
            <ChevronDownIcon />
          </button>
          {open && (
            <div className="dest-pop">
              <input
                className="input"
                type="text"
                aria-label="Search places"
                placeholder="Search places"
                autoComplete="off"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKey}
              />
              <ul className="dest-list" role="listbox" aria-label="Places">
                {hits.length > 0 ? (
                  hits.map((h) => (
                    <li key={`${h.country}/${h.place}`} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={h.place === place && h.country === country}
                        className="dest-item"
                        onClick={() => {
                          choose(h)
                          close(true)
                        }}
                      >
                        <span>{h.place}</span>
                        <small>{h.country}</small>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="dest-empty">No listed place contains that text.</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <span className="field-hint" id={hintId}>
          Pick from the list, or search by place name.
        </span>
        {noMatch ? (
          <p className="field-error no-match" role="alert">
            <AlertIcon />
            <span>{NO_MATCH}</span>
          </p>
        ) : (
          <FieldError id={`${idPrefix}-destination-e`} message={error} />
        )}
      </div>
      {suggestion && (
        <div className="card suggestion">
          <p aria-live="polite">
            Did you mean <strong>{suggestion.place}</strong>?
          </p>
          <div className="cluster">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => choose(suggestion)}
            >
              <CheckIcon />
              Use {suggestion.place}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFeedback}>
              <XIcon />
              No thanks
            </button>
          </div>
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-country`}>
          Country
        </label>
        <select
          className="select"
          id={`${idPrefix}-country`}
          value={country}
          onChange={(event) => changeCountry(event.target.value)}
        >
          <option value="">Choose a country</option>
          {catalogue.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-place`}>
          Place
        </label>
        <select
          className="select"
          id={`${idPrefix}-place`}
          value={place}
          disabled={!country}
          aria-describedby={`${idPrefix}-place-h`}
          onChange={(event) => changePlace(event.target.value)}
        >
          <option value="">{country ? `Choose a place in ${country}` : 'Choose a country first'}</option>
          {places.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="field-hint" id={`${idPrefix}-place-h`}>
          Only places in your chosen country are listed.
        </span>
      </div>
    </div>
  )
}
