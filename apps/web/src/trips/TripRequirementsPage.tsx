import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AlertIcon, EditIcon, RefreshIcon } from '../auth/icons'
import { fetchRequirements, fetchTrip } from './api'
import type { Trip, TravellerRequirement } from './api'
import { CompanionDetailsDrawer } from './CompanionDetailsDrawer'
import { Toast } from './Toast'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; trip: Trip; rows: TravellerRequirement[] }

const dates = (trip: Trip) =>
  [trip.start_date, trip.end_date]
    .filter(Boolean)
    .map((d) =>
      new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    )
    .join(' – ')

const incomplete = (row: TravellerRequirement) =>
  !row.citizenship || !row.residence || !row.health_status

/** Owner only: what each traveller needs for the trip, worked out from their own details. */
export function TripRequirementsPage() {
  const { tripId = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    let current = true
    Promise.all([fetchTrip(tripId), fetchRequirements(tripId)]).then(
      ([trip, rows]) => current && setLoad({ status: 'loaded', trip, rows }),
      () => current && setLoad({ status: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [tripId, attempt])

  const reload = () => {
    setLoad({ status: 'loading' })
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
        <p>We couldn't load the requirements. Try again.</p>
        <button className="btn btn-secondary" type="button" onClick={reload}>
          <RefreshIcon />
          Retry
        </button>
      </div>
    )

  const { trip, rows } = load
  const editingTraveller = (trip.travellers ?? []).find((t) => t.id === editing)

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <h1>Trip requirements</h1>
        <p className="text-muted">
          For {trip.destination ?? trip.name}
          {dates(trip) && `, ${dates(trip)}`}.
        </p>
        <div>
          <Link to={`/trips/${encodeURIComponent(trip.id)}`}>Back to travellers</Link>
        </div>
      </div>
      <div className="req-wrap" aria-live="polite">
        <table className="req">
          <thead>
            <tr>
              <th scope="col">Traveller</th>
              <th scope="col">Citizenship</th>
              <th scope="col">Residence</th>
              <th scope="col">Health status</th>
              <th scope="col">Medical requirement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.traveller_id ?? 'owner'}>
                  <td data-label="Traveller">{row.name}</td>
                  <td data-label="Citizenship">{row.citizenship || 'Not yet entered'}</td>
                  <td data-label="Residence">{row.residence || 'Not yet entered'}</td>
                  <td data-label="Health status">{row.health_status || 'Not yet entered'}</td>
                  <td data-label="Medical requirement">
                    {row.medical ??
                      (row.traveller_id && incomplete(row) ? (
                        <>
                          <span className="badge badge-warning">
                            <AlertIcon />
                            Details needed
                          </span>{' '}
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            aria-label={`Enter details for ${row.name}`}
                            onClick={() => setEditing(row.traveller_id)}
                          >
                            <EditIcon />
                            Enter details
                          </button>
                        </>
                      ) : null)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editingTraveller && (
        <CompanionDetailsDrawer
          tripId={trip.id}
          traveller={editingTraveller}
          onClose={() => setEditing(null)}
          onSaved={(_, who) => {
            setEditing(null)
            setToast({ id: Date.now(), message: `${who} details saved.` })
            reload()
          }}
        />
      )}
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </div>
  )
}
