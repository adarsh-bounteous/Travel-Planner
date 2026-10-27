import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchTrip } from './api'
import type { Trip } from './api'
import { fetchWeatherHelper } from './helpersApi'
import type { WeatherHelper } from './helpersApi'
import { formatDate, formatTripDates } from './helperFormat'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; trip: Trip; helper: WeatherHelper }

const monthName = (month: number) =>
  new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: 'long' })

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

/** Owner only: typical weather for the trip month, and a forecast once the trip is within 14 days. */
export function WeatherHelperPage() {
  const { tripId = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let current = true
    Promise.all([fetchTrip(tripId), fetchWeatherHelper(tripId)]).then(
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
        <p>We couldn't load the weather helper. Try again.</p>
        <button className="btn btn-secondary" type="button" onClick={reload}>
          Retry
        </button>
      </div>
    )

  const { trip, helper } = load
  const { typical, forecast } = helper
  const tripDates = formatTripDates(helper.start_date, helper.end_date)
  const unavailable = forecast?.status === 'unavailable'

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to={`/trips/${encodeURIComponent(trip.id)}`}>Trip</Link> / Weather helper
      </nav>
      <h1>Weather helper</h1>
      <p className="text-muted">
        {trip.destination ?? trip.name}
        {tripDates && `, ${tripDates}`}
      </p>

      {unavailable && (
        <section className="card stack">
          <div className="alert alert-danger" role="alert">
            <p className="alert-title">The forecast is unavailable right now.</p>
            <p>
              We couldn't load the forecast for your trip dates. Try again in a moment. Typical weather is
              shown below.
            </p>
          </div>
          {refreshing && <span className="skeleton" />}
          <div className="cluster">
            <button className="btn btn-secondary btn-sm" type="button" disabled={refreshing} onClick={reload}>
              Try again
            </button>
          </div>
        </section>
      )}

      {typical ? (
        <section className="card stack">
          <h3>
            Typical weather for {monthName(typical.month)}
            {unavailable && `, dated ${formatDate(typical.as_of)}`}
          </h3>
          <div className="stack stack-sm">
            <p>{typical.summary}</p>
            <p className="text-muted">
              About {typical.rain_mm} mm of rain over {typical.rain_days} days in the month.
            </p>
          </div>
          {!forecast && (
            <p className="text-sm text-muted">A forecast appears here once your trip is within 14 days.</p>
          )}
        </section>
      ) : (
        <div className="alert alert-info">
          <p>
            {helper.start_date
              ? "We don't have weather guidance for this destination yet."
              : 'Add dates to see weather guidance.'}
          </p>
        </div>
      )}

      {forecast?.status === 'available' && (
        <section className="card stack">
          <h3>Forecast for trip dates</h3>
          {refreshing && <span className="skeleton" />}
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">
                Daily forecast for {trip.destination ?? trip.name}, {tripDates}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">High</th>
                  <th scope="col">Low</th>
                  <th scope="col">Rain</th>
                </tr>
              </thead>
              <tbody>
                {forecast.days.map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{dayLabel(day.date)}</th>
                    <td>{day.high_c}°C</td>
                    <td>{day.low_c}°C</td>
                    <td>{day.rain_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cluster">
            <button className="btn btn-ghost btn-sm" type="button" disabled={refreshing} onClick={reload}>
              Refresh forecast
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
