import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon } from '../auth/icons'
import { fetchProfile, saveProfile } from '../trips/api'
import type {
  DepartureWindow,
  Profile,
  TransportCabin,
  TransportMode,
  TransportPreferences,
} from '../trips/api'
import { Toast } from '../trips/Toast'

const MODES: { id: TransportMode; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'train', label: 'Train' },
  { id: 'bus', label: 'Bus' },
  { id: 'taxi', label: 'Taxi' },
]
const CABINS: { id: TransportCabin; label: string }[] = [
  { id: 'economy', label: 'Economy' },
  { id: 'premium_economy', label: 'Premium economy' },
  { id: 'business', label: 'Business' },
]
const WINDOWS: { id: DepartureWindow; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
]
const STOP_CHOICES = ['0', '1', '2']
const STOPS_ERROR = 'Enter a whole number from 0 to 10.'

/** The draft keeps stops as typed so a half-entered number is not lost. */
type Draft = {
  modes: TransportMode[]
  cabin: TransportCabin | null
  window: DepartureWindow | null
  stops: string
  providers: string[]
}

const toDraft = (p: TransportPreferences): Draft => ({
  modes: p.modes,
  cabin: p.cabin,
  window: p.departure_window,
  stops: p.max_stops === null ? '' : String(p.max_stops),
  providers: p.providers,
})

/** A whole number from 0 to 10, '' for none, or 'invalid'. */
function parseStops(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  return value <= 10 ? value : 'invalid'
}

const labelFor = <T extends string>(items: { id: T; label: string }[], id: T) =>
  items.find((item) => item.id === id)?.label ?? id

type Row = 'modes' | 'cabin' | 'window' | 'stops' | 'providers'

/** What each row would save, as text; '' when nothing is set. */
function rowText(row: Row, d: Draft): string {
  switch (row) {
    case 'modes':
      return MODES.filter((m) => d.modes.includes(m.id))
        .map((m) => m.label)
        .join(', ')
    case 'cabin':
      return d.cabin ? labelFor(CABINS, d.cabin) : ''
    case 'window':
      return d.window ? labelFor(WINDOWS, d.window) : ''
    case 'stops':
      return d.stops.trim()
    case 'providers':
      return d.providers.join(', ')
  }
}

function SavedBadge({ row, saved, draft }: { row: Row; saved: Draft; draft: Draft }) {
  if (rowText(row, saved) !== rowText(row, draft))
    return <span className="badge badge-warning">Unsaved change</span>
  const text = rowText(row, saved)
  return text === '' ? (
    <span className="badge badge-neutral">Not set</span>
  ) : (
    <span className="badge badge-success">Saved: {text}</span>
  )
}

const ROWS: Row[] = ['modes', 'cabin', 'window', 'stops', 'providers']

export function TransportPreferencesPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [provider, setProvider] = useState('')
  const [providerError, setProviderError] = useState<string | null>(null)
  const [stopsError, setStopsError] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchProfile().then((loaded) => {
      setProfile(loaded)
      setSaved(toDraft(loaded.transport_preferences))
      setDraft(toDraft(loaded.transport_preferences))
    }, () => setFailed(true))
  }, [])

  const header = (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/account">Account</Link>
          </li>
          <li aria-current="page">Transport preferences</li>
        </ol>
      </nav>
      <div className="stack stack-sm">
        <h1>Transport preferences</h1>
        <p className="text-muted">
          All optional. Saved once, applied quietly whenever you search transport. Anything you
          leave unset excludes nothing.
        </p>
      </div>
    </>
  )

  if (failed)
    return (
      <div className="col stack">
        {header}
        <p className="alert alert-danger" role="alert">
          We couldn't load your preferences. Reload to try again.
        </p>
      </div>
    )

  if (!profile || !saved || !draft)
    return (
      <div className="col stack">
        {header}
        <div className="stack" role="status" aria-label="Loading">
          {ROWS.map((row) => (
            <span key={row} className="skeleton card" />
          ))}
        </div>
      </div>
    )

  const change = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const dirty = ROWS.some((row) => rowText(row, saved) !== rowText(row, draft))
  const anySaved = ROWS.some((row) => rowText(row, saved) !== '')

  const toggleMode = (id: TransportMode) =>
    change({
      modes: draft.modes.includes(id)
        ? draft.modes.filter((m) => m !== id)
        : MODES.map((m) => m.id).filter((m) => m === id || draft.modes.includes(m)),
    })

  const addProvider = () => {
    const name = provider.trim()
    if (name === '') return
    if (draft.providers.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setProviderError(`${name} is already in your list. Add a different provider.`)
      return
    }
    setProviderError(null)
    setProvider('')
    change({ providers: [...draft.providers, name] })
  }

  const save = async () => {
    const maxStops = parseStops(draft.stops)
    if (maxStops === 'invalid') {
      setStopsError(true)
      return
    }
    setStopsError(false)
    const next: TransportPreferences = {
      modes: draft.modes,
      cabin: draft.cabin,
      departure_window: draft.window,
      max_stops: maxStops,
      providers: draft.providers,
    }
    const sent: Profile = { ...profile, transport_preferences: next }
    const stored = (await saveProfile(sent)) ?? sent
    setProfile(stored)
    setSaved(toDraft(stored.transport_preferences))
    setDraft(toDraft(stored.transport_preferences))
    const cleared = ROWS.every((row) => rowText(row, toDraft(stored.transport_preferences)) === '')
    setToast({
      id: Date.now(),
      message: cleared ? 'Transport preferences cleared.' : 'Transport preferences saved.',
    })
  }

  // A chosen radio can be chosen again to unset it, so every part stays optional.
  const radio = <T extends string>(
    name: string,
    item: { id: T; label: string },
    current: T | null,
    set: (id: T | null) => void,
  ) => (
    <label key={item.id} className="cluster">
      <input
        type="radio"
        name={name}
        value={item.id}
        checked={current === item.id}
        onChange={() => {}}
        onClick={() => set(current === item.id ? null : item.id)}
      />
      <span>{item.label}</span>
    </label>
  )

  const badge = (row: Row) => <SavedBadge row={row} saved={saved} draft={draft} />
  const customStops = STOP_CHOICES.includes(draft.stops) ? '' : draft.stops

  return (
    <div className="col stack">
      {header}
      <p
        className={`alert ${dirty ? 'alert-warning' : anySaved ? 'alert-success' : ''}`}
        role="status"
      >
        {dirty
          ? 'You have unsaved changes.'
          : anySaved
            ? 'Your preferences are saved.'
            : 'Nothing set yet.'}
      </p>

      <fieldset className="pref-row card stack">
        <legend className="pref-head">Preferred modes</legend>
        <div className="pref-options chipset">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`chip${draft.modes.includes(mode.id) ? ' is-selected' : ''}`}
              aria-pressed={draft.modes.includes(mode.id)}
              onClick={() => toggleMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {badge('modes')}
      </fieldset>

      <fieldset className="pref-row card stack">
        <legend className="pref-head">Cabin class</legend>
        <div className="pref-options">
          {CABINS.map((c) => radio('cabin', c, draft.cabin, (id) => change({ cabin: id })))}
        </div>
        {badge('cabin')}
      </fieldset>

      <fieldset className="pref-row card stack">
        <legend className="pref-head">Departure window</legend>
        <div className="pref-options">
          {WINDOWS.map((w) => radio('window', w, draft.window, (id) => change({ window: id })))}
        </div>
        {badge('window')}
      </fieldset>

      <fieldset className="pref-row card stack">
        <legend className="pref-head">Maximum stops</legend>
        <div className="pref-options">
          {STOP_CHOICES.map((value) =>
            radio('stops', { id: value, label: value }, draft.stops || null, (id) =>
              change({ stops: id ?? '' }),
            ),
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="stops-other">
            Or enter another number
          </label>
          <input
            id="stops-other"
            className={`input${stopsError ? ' is-invalid' : ''}`}
            inputMode="numeric"
            aria-invalid={stopsError || undefined}
            aria-describedby={stopsError ? 'stops-error' : undefined}
            value={customStops}
            onChange={(event) => {
              setStopsError(false)
              change({ stops: event.target.value })
            }}
          />
          {stopsError && (
            <p className="field-error cluster" id="stops-error" role="alert">
              <AlertIcon />
              <span>{STOPS_ERROR}</span>
            </p>
          )}
        </div>
        {badge('stops')}
      </fieldset>

      <fieldset className="pref-row card stack">
        <legend className="pref-head">Preferred providers</legend>
        <div className="pref-options chipset">
          {draft.providers.map((name) => (
            <span key={name} className="chip">
              {name}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${name}`}
                onClick={() => change({ providers: draft.providers.filter((p) => p !== name) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="provider-add">
            Add a provider
          </label>
          <div className="add-row">
            <input
              id="provider-add"
              className={`input${providerError ? ' is-invalid' : ''}`}
              aria-invalid={providerError ? true : undefined}
              aria-describedby={providerError ? 'provider-error' : undefined}
              value={provider}
              onChange={(event) => {
                setProviderError(null)
                setProvider(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addProvider()
                }
              }}
            />
            <button className="btn btn-secondary" type="button" onClick={addProvider}>
              Add provider
            </button>
          </div>
          {providerError && (
            <p className="field-error cluster" id="provider-error" role="alert">
              <AlertIcon />
              <span>{providerError}</span>
            </p>
          )}
        </div>
        {badge('providers')}
      </fieldset>

      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={save}>
          Save preferences
        </button>
        <Link className="btn btn-secondary" to="/transport">
          Back to search
        </Link>
      </div>
      <div className="toast-slot">{toast && <Toast key={toast.id} message={toast.message} />}</div>
    </div>
  )
}
