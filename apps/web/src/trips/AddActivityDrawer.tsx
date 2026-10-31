import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertIcon, CheckIcon, PlusIcon, SearchIcon, XIcon } from '../auth/icons'
import { searchPlaces } from '../places/api'
import { addActivity, fetchRecommendations } from './api'
import type { ActivityInput, Day, Trip } from './api'
import { Overlay } from './Overlay'

type Way = 'recs' | 'search' | 'custom'

const WAYS: { id: Way; label: string }[] = [
  { id: 'recs', label: 'From recommendations' },
  { id: 'search', label: 'Search places' },
  { id: 'custom', label: 'Custom activity' },
]

type Pick = { id: string; name: string; detail?: string | null }

type PickerProps = {
  label: string
  picks: Pick[]
  pending: boolean
  onAdd: (pick: Pick) => void
}

/** Radio rows plus one Add button that names the selected row. The first row starts selected. */
function Picker({ label, picks, pending, onAdd }: PickerProps) {
  const [selectedId, setSelectedId] = useState(picks[0]?.id)
  const selected = picks.find((p) => p.id === selectedId) ?? picks[0]
  return (
    <>
      <div className="pick-list" role="radiogroup" aria-label={label}>
        {picks.map((pick) => (
          <label key={pick.id} className="pick">
            <input
              className="radio"
              type="radio"
              name={label}
              checked={pick.id === selected.id}
              onChange={() => setSelectedId(pick.id)}
            />
            <span className="pick-body">
              <span className="option-title">{pick.name}</span>
              {pick.detail && <span className="note-for">{pick.detail}</span>}
            </span>
          </label>
        ))}
      </div>
      <button className="btn btn-secondary" type="button" disabled={pending} onClick={() => onAdd(selected)}>
        <PlusIcon />
        {`Add ${selected.name}`}
      </button>
    </>
  )
}

type AddActivityDrawerProps = {
  trip: Trip
  day: Day
  onClose: () => void
  onAdded: (trip: Trip, name: string) => void
}

/** Adds an activity to one day: from recommendations, a place search, or a name the traveller types. */
export function AddActivityDrawer({ trip, day, onClose, onAdded }: AddActivityDrawerProps) {
  const [way, setWay] = useState<Way>('recs')
  const [recs, setRecs] = useState<Pick[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Pick[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchRecommendations(trip.id, day.date).then(setRecs, () => setRecs([]))
  }, [trip.id, day.date])

  const add = async (input: ActivityInput) => {
    setFailed(false)
    setPending(true)
    try {
      onAdded(await addActivity(trip.id, input), input.name)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  const search = async () => {
    const text = query.trim()
    if (text === '' || searching) return
    setSearching(true)
    setSearchFailed(false)
    try {
      // Without a destination on the trip, what was typed is the place to look in.
      const found = trip.destination ? await searchPlaces(trip.destination, text) : await searchPlaces(text)
      setResults(found.map((p) => ({ id: p.id, name: p.name })))
    } catch {
      setResults(null)
      setSearchFailed(true)
    }
    setSearching(false)
  }

  const onSearchKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void search()
  }

  const save = () => {
    const trimmed = name.trim()
    if (trimmed === '') {
      setNameError(true)
      nameInput.current?.focus()
      return
    }
    setNameError(false)
    void add({ name: trimmed, date: day.date })
  }

  const addPick = (pick: Pick) => add({ name: pick.name, date: day.date, detail: pick.detail })

  return (
    <Overlay kind="drawer" labelledBy="add-activity-title" onClose={onClose}>
      <div className="stack">
        <div className="title-row">
          <h2 id="add-activity-title">{`Add activity to ${day.name}`}</h2>
          <button className="btn btn-ghost" type="button" aria-label="Close add activity" onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="Ways to add an activity">
          {WAYS.map(({ id, label }) => (
            <button
              key={id}
              className="tab"
              role="tab"
              type="button"
              aria-selected={way === id}
              onClick={() => setWay(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {way === 'recs' &&
          (recs === null ? (
            <div className="stack stack-sm" role="status" aria-label="Loading recommendations">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ) : recs.length === 0 ? (
            <div className="empty-state" role="status">
              <SearchIcon />
              <p>No recommendations are available for this day.</p>
              <p className="note-for">Search places or add a custom activity instead.</p>
            </div>
          ) : (
            <Picker label="Recommended activities" picks={recs} pending={pending} onAdd={addPick} />
          ))}
        {way === 'search' && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="place-search">
                Search places
              </label>
              <input
                className="input"
                id="place-search"
                type="search"
                autoComplete="off"
                placeholder="Search places"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKey}
              />
            </div>
            <button className="btn btn-secondary" type="button" disabled={searching} onClick={search}>
              <SearchIcon />
              {searching ? 'Searching…' : 'Search'}
            </button>
            {searchFailed && (
              <p className="field-error" role="alert">
                We couldn't search places. Try again.
              </p>
            )}
            {results !== null &&
              (results.length === 0 ? (
                <p className="text-muted" role="status">
                  No places were found. Check the spelling or try a nearby area, then press Enter to search
                  again.
                </p>
              ) : (
                <Picker key={query} label="Place results" picks={results} pending={pending} onAdd={addPick} />
              ))}
          </>
        )}
        {way === 'custom' && (
          <div className={`field${nameError ? ' is-invalid' : ''}`}>
            <label className="field-label" htmlFor="custom-name">
              Activity name
            </label>
            <input
              ref={nameInput}
              className={`input${nameError ? ' is-invalid' : ''}`}
              id="custom-name"
              autoComplete="off"
              maxLength={120}
              placeholder="Activity name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'custom-name-error' : undefined}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save()
              }}
            />
            {nameError && (
              <p className="field-error cluster" id="custom-name-error" role="alert">
                <AlertIcon />
                <span>Enter an activity name to save.</span>
              </p>
            )}
            <button className="btn btn-primary" type="button" disabled={pending} onClick={save}>
              <CheckIcon />
              {pending ? 'Saving…' : 'Save activity'}
            </button>
          </div>
        )}
        {failed && (
          <p className="field-error cluster" role="status">
            <AlertIcon />
            <span>We couldn't add that activity. Try again.</span>
          </p>
        )}
      </div>
    </Overlay>
  )
}
