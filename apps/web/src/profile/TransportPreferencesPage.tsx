import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertIcon, ArrowLeftIcon, CheckIcon, PlusIcon, XIcon } from '../auth/icons'
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
const QUICK_STOPS = [0, 1, 2]

const STOPS_ERROR = 'Enter a whole number from 0 to 10.'
const MAX_STOPS = 10

// What the form edits. Stops is text so a half-typed or invalid number can be shown and refused on Save.
type Draft = Omit<TransportPreferences, 'max_stops'> & { stops: string }

const toDraft = (p: TransportPreferences): Draft => ({
  modes: p.modes,
  cabin: p.cabin,
  departure_window: p.departure_window,
  stops: p.max_stops === null ? '' : String(p.max_stops),
  providers: p.providers,
})

const parseStops = (text: string): number | null | 'invalid' => {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 && n <= MAX_STOPS ? n : 'invalid'
}

const stopsLabel = (n: number) => (n === 1 ? '1 stop' : `${n} stops`)
const labelIn = (list: { id: string; label: string }[], id: string | null) =>
  list.find((x) => x.id === id)?.label ?? ''

type RowKey = 'modes' | 'cabin' | 'window' | 'stops' | 'providers'

const savedText = (p: TransportPreferences): Record<RowKey, string> => ({
  modes: p.modes.map((m) => labelIn(MODES, m)).join(', '),
  cabin: labelIn(CABINS, p.cabin),
  window: labelIn(WINDOWS, p.departure_window),
  stops: p.max_stops === null ? '' : stopsLabel(p.max_stops),
  providers: p.providers.join(', '),
})

const isUnset = (p: TransportPreferences) => Object.values(savedText(p)).every((t) => t === '')

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

function SavedBadge({ saved, changed }: { saved: string; changed: boolean }) {
  if (changed) return <span className="badge badge-warning">Unsaved change</span>
  if (saved === '') return <span className="badge badge-neutral">Not set</span>
  return (
    <span className="badge badge-success">
      <CheckIcon />
      {`Saved: ${saved}`}
    </span>
  )
}

function Row({
  legend,
  saved,
  changed,
  children,
}: {
  legend: string
  saved: string
  changed: boolean
  children: ReactNode
}) {
  return (
    <fieldset className="pref-row">
      <div className="pref-head">
        <legend>{legend}</legend>
        <SavedBadge saved={saved} changed={changed} />
      </div>
      {children}
    </fieldset>
  )
}

export function TransportPreferencesPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [providerText, setProviderText] = useState('')
  const [providerError, setProviderError] = useState<string | null>(null)
  const [stopsError, setStopsError] = useState(false)
  const [pending, setPending] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchProfile().then(
      (p) => {
        setProfile(p)
        setDraft(toDraft(p.transport_preferences))
      },
      () => setFailed(true),
    )
  }, [])

  if (failed || !profile || !draft) {
    return (
      <div className="stack stack-lg page">
        <h1>Transport preferences</h1>
        {failed ? (
          <p className="alert alert-danger" role="alert">
            We couldn't load your preferences. Reload to try again.
          </p>
        ) : (
          <div className="stack" role="status" aria-label="Loading">
            <span className="skeleton card" />
            <span className="skeleton card" />
          </div>
        )}
      </div>
    )
  }

  const saved = profile.transport_preferences
  const savedBase = toDraft(saved)
  const change = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setSaveFailed(false)
  }
  const changed: Record<RowKey, boolean> = {
    modes: !sameList(draft.modes, savedBase.modes),
    cabin: draft.cabin !== savedBase.cabin,
    window: draft.departure_window !== savedBase.departure_window,
    stops: draft.stops !== savedBase.stops,
    providers: !sameList(draft.providers, savedBase.providers),
  }
  const anyChange = Object.values(changed).some(Boolean)
  const text = savedText(saved)

  const toggleMode = (mode: TransportMode) =>
    change({
      modes: draft.modes.includes(mode) ? draft.modes.filter((m) => m !== mode) : [...draft.modes, mode],
    })

  const addProvider = () => {
    const name = providerText.trim()
    setProviderError(null)
    if (name === '') return
    if (draft.providers.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setProviderError(`${name} is already in your list. Add a different provider.`)
      return
    }
    change({ providers: [...draft.providers, name] })
    setProviderText('')
  }

  const save = async () => {
    const maxStops = parseStops(draft.stops)
    setStopsError(maxStops === 'invalid')
    if (maxStops === 'invalid') return
    const next: TransportPreferences = {
      modes: draft.modes,
      cabin: draft.cabin,
      departure_window: draft.departure_window,
      max_stops: maxStops,
      providers: draft.providers,
    }
    setPending(true)
    setSaveFailed(false)
    try {
      const sent = { ...profile, transport_preferences: next }
      const stored = await saveProfile(sent)
      const result = { ...sent, ...stored, transport_preferences: stored?.transport_preferences ?? next }
      setProfile(result)
      setDraft(toDraft(result.transport_preferences))
      setToast({
        id: Date.now(),
        message: isUnset(result.transport_preferences)
          ? 'Transport preferences cleared.'
          : 'Transport preferences saved.',
      })
    } catch {
      setSaveFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="stack stack-lg page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/profile">Profile</Link>
          </li>
          <li aria-current="page">Transport preferences</li>
        </ol>
      </nav>
      <div className="stack stack-sm">
        <h1>Transport preferences</h1>
        <p className="text-muted">Optional. Used to match transport options on later trips.</p>
      </div>

      <div
        className={`alert ${anyChange ? 'alert-warning' : isUnset(saved) ? 'alert-info' : 'alert-success'}`}
        role="status"
      >
        {anyChange ? (
          <>
            <span className="alert-title">You have unsaved changes.</span> Save to use them on later
            trips.
          </>
        ) : isUnset(saved) ? (
          <>
            <span className="alert-title">Nothing set yet.</span> That is fine. Search runs without
            asking, and every option stays in your shortlist.
          </>
        ) : (
          <>
            <span className="alert-title">Your preferences are saved.</span> You will not be asked for
            them again when you search.
          </>
        )}
      </div>

      <form
        className="card stack stack-lg"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Row legend="Preferred modes" saved={text.modes} changed={changed.modes}>
          <div className="pref-options">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                aria-pressed={draft.modes.includes(m.id)}
                onClick={() => toggleMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="field-hint">
            Pick any you like. Leave empty and every mode stays in your shortlist.
          </p>
        </Row>
        <hr className="divider" />

        <Row legend="Cabin or comfort class" saved={text.cabin} changed={changed.cabin}>
          <div className="pref-options">
            {CABINS.map((c) => (
              <label className="check" key={c.id}>
                <input
                  className="radio"
                  type="radio"
                  name="cabin"
                  value={c.id}
                  checked={draft.cabin === c.id}
                  onChange={() => change({ cabin: c.id })}
                />
                {c.label}
              </label>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ cabin: null })}>
              Clear class
            </button>
          </div>
        </Row>
        <hr className="divider" />

        <Row legend="Departure-time window" saved={text.window} changed={changed.window}>
          <div className="pref-options">
            {WINDOWS.map((w) => (
              <label className="check" key={w.id}>
                <input
                  className="radio"
                  type="radio"
                  name="window"
                  value={w.id}
                  checked={draft.departure_window === w.id}
                  onChange={() => change({ departure_window: w.id })}
                />
                {w.label}
              </label>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => change({ departure_window: null })}
            >
              Clear window
            </button>
          </div>
        </Row>
        <hr className="divider" />

        <Row legend="Maximum stops" saved={text.stops} changed={changed.stops}>
          <div className="pref-options">
            {QUICK_STOPS.map((n) => (
              <label className="check" key={n}>
                <input
                  className="radio"
                  type="radio"
                  name="stops"
                  value={String(n)}
                  checked={draft.stops === String(n)}
                  onChange={() => {
                    setStopsError(false)
                    change({ stops: String(n) })
                  }}
                />
                {stopsLabel(n)}
              </label>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStopsError(false)
                change({ stops: '' })
              }}
            >
              Clear stops
            </button>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="stops-number">
              Or enter another number
            </label>
            <input
              className={`input${stopsError ? ' is-invalid' : ''}`}
              id="stops-number"
              type="number"
              min={0}
              max={MAX_STOPS}
              inputMode="numeric"
              aria-invalid={stopsError || undefined}
              aria-describedby={stopsError ? 'stops-hint stops-error' : 'stops-hint'}
              value={draft.stops}
              onChange={(e) => change({ stops: e.target.value })}
            />
            <span className="field-hint" id="stops-hint">
              Any whole number from 0 to 10
            </span>
            {stopsError && (
              <p className="field-error cluster" id="stops-error" role="alert">
                <AlertIcon />
                <span>{STOPS_ERROR}</span>
              </p>
            )}
          </div>
        </Row>
        <hr className="divider" />

        <div className="pref-row stack stack-sm">
          <div className="pref-head">
            <span className="pref-title" id="providers-title">
              Preferred providers
            </span>
            <SavedBadge saved={text.providers} changed={changed.providers} />
          </div>
          <div className="pref-options" role="group" aria-labelledby="providers-title">
            {draft.providers.length === 0 && <span className="field-hint">No providers added.</span>}
            {draft.providers.map((name) => (
              <span className="chip is-selected" key={name}>
                {name}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon chip-remove"
                  aria-label={`Remove ${name}`}
                  onClick={() => change({ providers: draft.providers.filter((p) => p !== name) })}
                >
                  <XIcon />
                </button>
              </span>
            ))}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="provider-input">
              Add a provider
            </label>
            <div className="add-row">
              <input
                className={`input${providerError ? ' is-invalid' : ''}`}
                id="provider-input"
                placeholder="Provider name"
                autoComplete="off"
                aria-invalid={providerError ? true : undefined}
                aria-describedby={providerError ? 'provider-hint provider-error' : 'provider-hint'}
                value={providerText}
                onChange={(e) => setProviderText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addProvider()
                  }
                }}
              />
              <button type="button" className="btn btn-secondary" onClick={addProvider}>
                <PlusIcon />
                Add provider
              </button>
            </div>
            <span className="field-hint" id="provider-hint">
              Airlines, rail or coach companies, ride apps.
            </span>
            {providerError && (
              <p className="field-error" id="provider-error" role="alert">
                {providerError}
              </p>
            )}
          </div>
        </div>
      </form>

      {saveFailed && (
        <p className="alert alert-danger" role="alert">
          We couldn't save your preferences. Try again.
        </p>
      )}
      <div className="actions">
        <Link className="btn btn-ghost" to="/transport">
          <ArrowLeftIcon />
          Back to search
        </Link>
        <button className="btn btn-primary" type="button" disabled={pending} onClick={() => void save()}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" /> Saving
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      <div className="toast-slot">{toast && <Toast key={toast.id} message={toast.message} />}</div>
    </div>
  )
}
