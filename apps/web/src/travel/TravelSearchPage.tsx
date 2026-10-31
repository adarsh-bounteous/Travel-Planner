import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { EditIcon, SearchIcon } from '../auth/icons'
import { OptionCard } from '../components/OptionCard'
import { ValidationError } from '../trips/api'
import { formatMoney } from '../trips/stayOptions'
import { BookingLink } from './BookingLink'
import { searchTravel } from './api'
import type { TravelKind, TravelSearchParams, TravelSearchResult } from './api'

const TYPES: { id: TravelKind; label: string }[] = [
  { id: 'stay', label: 'Stay' },
  { id: 'flight', label: 'Flight' },
  { id: 'transport', label: 'Transport' },
]

const RETURN_BEFORE_DEPART =
  'Return date is before the departure date. Pick a return on or after the departure.'

type Field = 'destination' | 'depart' | 'return' | 'route'
type Errors = Partial<Record<Field, string>>

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** "12–15 Mar 2027", or "12 Mar – 3 Apr 2027" across months. */
export function formatRange(from: string, to: string) {
  const a = parts(from)
  if (!to || to === from) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`
  const b = parts(to)
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`
  return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`
}

function validate(q: TravelSearchParams): Errors {
  const errors: Errors = {}
  if (!q.destination.trim()) errors.destination = 'Add a destination, like Lisbon.'
  if (!q.depart) errors.depart = 'Pick a departure date.'
  if (q.type === 'stay' && !q.return) errors.return = 'Pick a return date.'
  if (q.type !== 'stay' && !q.route.trim()) errors.route = 'Add a route, like Porto - Lisbon.'
  return errors
}

const HINTS: Record<Field, string> = {
  destination: 'Try Lisbon, Paris or Tokyo.',
  depart: '',
  return: '',
  route: 'Flight and transport only.',
}

type FieldProps = {
  field: Field
  label: string
  value: string
  type?: string
  placeholder?: string
  wide?: boolean
  error?: string
  onChange: (value: string) => void
}

function SearchField({ field, label, value, type, placeholder, wide, error, onChange }: FieldProps) {
  const id = `travel-${field}`
  const noteId = `${id}-note`
  return (
    <div className={`field${wide ? ' field-wide' : ''}${error ? ' is-invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`input${error ? ' is-invalid' : ''}`}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span id={noteId} className="field-error" role="alert">
          {error}
        </span>
      ) : (
        <span id={noteId} className="field-hint">
          {HINTS[field]}
        </span>
      )}
    </div>
  )
}

/** Search stays, flights or transport. Local mode answers with generated options; with it off the real provider does. */
export function TravelSearchPage() {
  const [type, setType] = useState<TravelKind>('stay')
  const [destination, setDestination] = useState('Lisbon')
  const [depart, setDepart] = useState('2027-03-12')
  const [returnDate, setReturnDate] = useState('2027-03-15')
  const [route, setRoute] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState<{ query: TravelSearchParams; result: TravelSearchResult } | null>(null)

  const query = (): TravelSearchParams => ({
    type,
    destination: destination.trim(),
    depart,
    // A one-way flight or transport search has no return of its own.
    return: type === 'stay' ? returnDate : returnDate || depart,
    route: type === 'stay' ? '' : route.trim(),
  })

  const run = async (q: TravelSearchParams) => {
    setPending(true)
    setFailed(false)
    try {
      setDone({ query: q, result: await searchTravel(q) })
    } catch (error) {
      if (error instanceof ValidationError) setErrors({ return: RETURN_BEFORE_DEPART })
      else setFailed(true)
    } finally {
      setPending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const q = query()
    const found = validate(q)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    void run(q)
  }

  const searchButton = (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <SearchIcon />
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" /> Searching…
        </>
      ) : (
        'Search'
      )}
    </button>
  )

  if (done) {
    const { query: q, result } = done
    const summary = [q.destination, formatRange(q.depart, q.return), TYPES.find((t) => t.id === q.type)?.label]
    if (q.type !== 'stay') summary.push(q.route)
    return (
      <form className="inbox-col stack" onSubmit={(e) => { e.preventDefault(); void run(q) }}>
        {result.matched && (
          result.source === 'local' ? (
            <div className="alert alert-info" role="status">
              <span className="alert-title">Local mode is on.</span> These options are generated for this
              search. Nothing is booked with a real provider.
            </div>
          ) : (
            <div className="alert alert-warning" role="status">
              <span className="alert-title">Local mode is off.</span> These results come from the real provider.
            </div>
          )
        )}
        <h1>Search results</h1>
        <p className="text-muted">{summary.join(' · ')}</p>
        {result.matched ? (
          <>
            <div className="stack" aria-label="Options">
              {result.options.map((o) => (
                <OptionCard
                  key={o.id}
                  title={o.name}
                  meta={o.detail}
                  price={
                    <>
                      {formatMoney(o.price, o.currency)} <span className="text-sm text-muted">{o.unit}</span>
                    </>
                  }
                  actions={
                    <BookingLink className="btn btn-secondary" url={o.url}>
                      <span aria-hidden="true">Book</span>
                      <span className="sr-only">Book {o.name}</span>
                    </BookingLink>
                  }
                />
              ))}
            </div>
            <div className="cluster">
              <button className="btn btn-ghost" type="button" onClick={() => setDone(null)}>
                <EditIcon />
                Change search
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="empty-state" role="status">
              <EmptyStateArt />
              <SearchIcon />
              <h2>No results for this place</h2>
              <p>
                We couldn't find “{q.destination}”. Check the spelling or try a larger city nearby.
              </p>
            </div>
            <div className="cluster">
              {searchButton}
              <button className="btn btn-ghost" type="button" onClick={() => setDone(null)}>
                <EditIcon />
                Change search
              </button>
            </div>
          </>
        )}
        {failed && (
          <div className="alert alert-danger" role="alert">
            Search didn't work. Try again.
          </div>
        )}
      </form>
    )
  }

  return (
    <form className="inbox-col stack" onSubmit={submit} noValidate>
      <h1>Search travel</h1>
      <div className="tabs" role="tablist" aria-label="Search type">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className="tab"
            type="button"
            role="tab"
            aria-selected={type === t.id}
            onClick={() => {
              setType(t.id)
              setErrors({})
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <SearchField
          field="destination"
          label="Destination"
          value={destination}
          placeholder="City or place"
          wide
          error={errors.destination}
          onChange={setDestination}
        />
        <SearchField field="depart" label="Depart" type="date" value={depart} error={errors.depart} onChange={setDepart} />
        <SearchField field="return" label="Return" type="date" value={returnDate} error={errors.return} onChange={setReturnDate} />
        {type !== 'stay' && (
          <SearchField
            field="route"
            label="Route"
            value={route}
            placeholder="From - to"
            wide
            error={errors.route}
            onChange={setRoute}
          />
        )}
      </div>
      {failed && (
        <div className="alert alert-danger" role="alert">
          Search didn't work. Try again.
        </div>
      )}
      {searchButton}
      <Link to="/account/local-mode">Local mode settings</Link>
    </form>
  )
}
