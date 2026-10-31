import { useEffect, useState } from 'react'
import { CoinsIcon, RefreshIcon } from '../auth/icons'
import { Link, useParams } from 'react-router'
import { fetchTrip } from './api'
import type { Trip } from './api'
import { fetchCurrencyHelper } from './helpersApi'
import type { CurrencyHelper } from './helpersApi'
import {
  convertAmount,
  currencyName,
  formatDate,
  formatMoney,
  formatNumber,
  formatRate,
  formatTripDates,
  parseAmount,
} from './helperFormat'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; trip: Trip; helper: CurrencyHelper }

type Side = 'destination' | 'home'

function Converter({
  rate,
  destination,
  home,
  lastKnownOn,
}: {
  rate: number
  destination: string
  home: string
  lastKnownOn?: string
}) {
  const [fields, setFields] = useState({
    destination: formatNumber(1000, destination),
    home: formatNumber(convertAmount(1000, rate, 'toHome'), home),
  })

  const change = (side: Side, text: string) => {
    const amount = parseAmount(text)
    if (side === 'destination')
      setFields({
        destination: text,
        home: amount === null ? '' : formatNumber(convertAmount(amount, rate, 'toHome'), home),
      })
    else
      setFields({
        home: text,
        destination:
          amount === null ? '' : formatNumber(convertAmount(amount, rate, 'toDestination'), destination),
      })
  }

  const destinationAmount = parseAmount(fields.destination)
  const homeAmount = parseAmount(fields.home)
  const result =
    destinationAmount === null || homeAmount === null
      ? 'Enter an amount to convert.'
      : `${formatMoney(destinationAmount, destination)} = ${formatMoney(homeAmount, home)}${
          lastKnownOn ? ' at the last known rate' : ''
        }`

  return (
    <section className="card stack">
      <h3>
        <CoinsIcon />
        Converter
      </h3>
      <div className="converter-fields">
        {(
          [
            { side: 'destination', code: destination },
            { side: 'home', code: home },
          ] as const
        ).map(({ side, code }) => (
          <div className="field" key={side}>
            <label className="field-label" htmlFor={`amount-${side}`}>
              Amount in {code}
            </label>
            <div className="amount">
              <span className="amount-code" aria-hidden="true">
                {code}
              </span>
              <input
                className="input"
                id={`amount-${side}`}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby="converter-result"
                value={fields[side]}
                onChange={(e) => change(side, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="result" id="converter-result" role="status">
        {result}
      </p>
      <p className="field-hint">
        {lastKnownOn
          ? `Amounts use the rate dated ${formatDate(lastKnownOn)}, so treat them as estimates.`
          : 'Type in either field. Enter numbers only, for example 2,500.'}
      </p>
    </section>
  )
}

/** Owner only: the destination currency, the exchange rate against the trip's currency, and a converter. */
export function CurrencyHelperPage() {
  const { tripId = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let current = true
    Promise.all([fetchTrip(tripId), fetchCurrencyHelper(tripId)]).then(
      ([trip, helper]) => {
        if (!current) return
        setLoad({ status: 'loaded', trip, helper })
        setRefreshing(false)
      },
      () => {
        if (!current) return
        setLoad({ status: 'failed' })
        setRefreshing(false)
      },
    )
    return () => {
      current = false
    }
  }, [tripId, attempt])

  const reload = () => {
    setRefreshing(true)
    setAttempt((n) => n + 1)
  }

  if (load.status === 'loading')
    return (
      <div className="stack" role="status" aria-label="Loading">
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    )
  if (load.status === 'failed')
    return (
      <div className="alert alert-danger" role="alert">
        <p>We couldn't load the currency helper. Try again.</p>
        <button className="btn btn-secondary" type="button" onClick={reload}>
          <RefreshIcon />
          Retry
        </button>
      </div>
    )

  const { trip, helper } = load
  const { destination_currency: destination, home_currency: home, live, last_known: lastKnown } = helper
  const usable = live ?? lastKnown
  const tripDates = formatTripDates(helper.start_date, helper.end_date)

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to={`/trips/${encodeURIComponent(trip.id)}`}>Trip</Link> / Currency helper
      </nav>
      <h1>Currency helper</h1>
      <p className="text-muted">
        {trip.destination ?? trip.name}
        {tripDates && `, ${tripDates}`}
      </p>

      {!destination ? (
        <div className="alert alert-info">
          <p>We don't have currency guidance for this destination yet.</p>
        </div>
      ) : (
        <>
          <section className="card stack rate-card" aria-live="polite">
            <dl className="kv">
              <dt>Destination currency</dt>
              <dd>{currencyName(destination)}</dd>
              <dt>Home currency</dt>
              <dd>{currencyName(home)}</dd>
            </dl>
            {live ? (
              <>
                <p className="rate-line">Live rate: {formatRate(Number(live.rate), destination, home)}</p>
                <p className="text-sm text-muted">
                  {home} 1 = {destination} {Number(live.inverse).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  . Updated {formatDate(live.as_of)}.
                </p>
              </>
            ) : (
              <>
                <div className="alert alert-danger" role="alert">
                  <p className="alert-title">The live rate is unavailable right now.</p>
                  <p>
                    We couldn't reach the exchange rate service. Try again in a moment
                    {lastKnown ? ', or use the last known rate below.' : '.'}
                  </p>
                </div>
                {refreshing && <span className="skeleton" />}
                {lastKnown && (
                  <p className="rate-line is-stale">
                    Last known rate: {formatRate(Number(lastKnown.rate), destination, home)}, dated{' '}
                    {formatDate(lastKnown.as_of)}
                  </p>
                )}
              </>
            )}
            <div className="cluster">
              <button
                className={`btn btn-sm ${live ? 'btn-ghost' : 'btn-secondary'}`}
                type="button"
                disabled={refreshing}
                onClick={reload}
              >
                <RefreshIcon />
                {live ? 'Refresh rate' : 'Try again'}
              </button>
            </div>
          </section>

          {usable && (
            <Converter
              key={usable.rate}
              rate={Number(usable.rate)}
              destination={destination}
              home={home}
              lastKnownOn={live ? undefined : usable.as_of}
            />
          )}
        </>
      )}
    </div>
  )
}
