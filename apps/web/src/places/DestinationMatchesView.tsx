import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertIcon, ArrowLeftIcon, CheckIcon, SearchIcon, SuitcaseIcon } from '../auth/icons'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { HINT_LIVE_OFF, NOTE_LIVE_UNAVAILABLE } from '../trips/DestinationPicker'
import { matchDestination } from './api'
import type { DestinationMatch } from './api'
import { MIN_QUERY_LENGTH, useDestinationSearch } from './useDestinationSearch'

type ResultRowProps = { match: DestinationMatch; onStart: (match: DestinationMatch) => void }

function ResultRow({ match, onStart }: ResultRowProps) {
  const starter = match.kind === 'starter'
  return (
    <li className="card result-card">
      <div className="stack stack-sm">
        <h3>{match.name}</h3>
        <p className="text-sm text-muted">{match.region}</p>
        {starter ? (
          <span className="badge badge-success">
            <CheckIcon />
            Full guide
          </span>
        ) : (
          <span className="badge badge-neutral">Live place</span>
        )}
      </div>
      <button
        type="button"
        className={starter ? 'btn btn-secondary' : 'btn btn-primary'}
        aria-label={`Start trip to ${match.name}`}
        onClick={() => onStart(match)}
      >
        <SuitcaseIcon />
        Start trip
      </button>
    </li>
  )
}

/** Cities and towns that match `?q=`: starter destinations first, then live places. */
export function DestinationMatchesView({ q }: { q: string }) {
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const [text, setText] = useState(q)
  const { status, result } = useDestinationSearch(q)

  const search = (event: FormEvent) => {
    event.preventDefault()
    const next = text.trim()
    if (next) setParams({ q: next })
  }
  const start = (match: DestinationMatch) =>
    navigate('/trips/new', {
      state: {
        destination: matchDestination(match),
        placeRef: match.kind === 'live' ? match.id : undefined,
      },
    })

  const matches = status === 'done' && result ? result.matches : []
  const starters = matches.filter((m) => m.kind === 'starter')
  const live = matches.filter((m) => m.kind === 'live')
  const tooShort = q.length < MIN_QUERY_LENGTH

  return (
    <div className="stack">
      <div>
        <Link className="btn btn-ghost" to="/">
          <ArrowLeftIcon />
          Back
        </Link>
      </div>
      <form role="search" className="search" onSubmit={search}>
        <label className="field-label" htmlFor="matches-search">
          Search a city or town
        </label>
        <input
          id="matches-search"
          className="input"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          <SearchIcon />
          Search
        </button>
      </form>
      {status === 'done' && result?.live === false && (
        <p className="alert alert-info">{HINT_LIVE_OFF}</p>
      )}
      {status === 'done' && result?.unavailable && (
        <p className="alert alert-warning cluster" role="status">
          <AlertIcon />
          <span>{NOTE_LIVE_UNAVAILABLE}</span>
        </p>
      )}
      <h2>Results for “{q}”</h2>
      {tooShort && <p className="text-muted">Type at least two letters to search.</p>}
      {status === 'searching' && (
        <div className="stack" aria-busy="true" aria-label="Searching places">
          <span className="skeleton card" />
          <span className="skeleton card" />
          <span className="skeleton card" />
        </div>
      )}
      {status === 'failed' && (
        <p className="alert alert-danger" role="alert">
          We couldn’t search right now. Try again in a moment.
        </p>
      )}
      {status === 'done' && matches.length === 0 && (
        <div className="empty-state" role="status">
          <EmptyStateArt />
          <SearchIcon />
          <h2>No places match</h2>
          <p>Try another search above.</p>
        </div>
      )}
      {starters.length > 0 && (
        <section className="stack" aria-labelledby="starter-group">
          <h3 className="group-label" id="starter-group">
            Starter destinations
          </h3>
          <ul className="stack">
            {starters.map((m) => (
              <ResultRow key={m.id} match={m} onStart={start} />
            ))}
          </ul>
        </section>
      )}
      {live.length > 0 && (
        <section className="stack" aria-labelledby="live-group">
          <h3 className="group-label" id="live-group">
            Live places
          </h3>
          <ul className="stack">
            {live.map((m) => (
              <ResultRow key={m.id} match={m} onStart={start} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
