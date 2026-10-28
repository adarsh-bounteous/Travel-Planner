import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AlertIcon, InfoIcon } from '../auth/icons'
import { fetchTrip, fetchVisa, setVisaSelfCheck } from './api'
import type { Trip, VisaResult, VisaView } from './api'
import { CompanionDetailsDrawer } from './CompanionDetailsDrawer'
import { Toast } from './Toast'
import { VisaStatusBadge } from './VisaStatusBadge'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; trip: Trip; view: VisaView }

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

const keyOf = (row: VisaResult) => row.traveller_id ?? 'owner'

/** Owner only: whether each traveller needs a visa, from their own citizenship and residence. */
export function VisaRequirementsPage() {
  const { tripId = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    let current = true
    Promise.all([fetchTrip(tripId), fetchVisa(tripId)]).then(
      ([trip, view]) => {
        if (!current) return
        setLoad({ status: 'loaded', trip, view })
        if (attempt > 0)
          setToast({ id: Date.now(), message: 'Rules updated. Results use the latest published rules.' })
      },
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

  if (load.status === 'failed')
    return (
      <div className="alert alert-danger" role="alert">
        <p>We couldn't load the visa requirements. Try again.</p>
        <button className="btn btn-secondary" type="button" onClick={reload}>
          Retry
        </button>
      </div>
    )

  const loaded = load.status === 'loaded' ? load : null
  const mark = async (row: VisaResult) => {
    if (!loaded) return
    const checked = !row.marked_self_check
    try {
      const view = await setVisaSelfCheck(tripId, keyOf(row), checked)
      setLoad({ ...loaded, view })
      setToast({
        id: Date.now(),
        message: checked ? 'Visa marked as "I\'ll check myself"' : 'Visa mark removed',
      })
    } catch {
      setToast({ id: Date.now(), message: "We couldn't save that mark. Try again." })
    }
  }
  const editingTraveller = (loaded?.trip.travellers ?? []).find((t) => t.id === editing)

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={`/trips/${encodeURIComponent(tripId)}`}>Trip plan</Link>
          </li>
          <li aria-current="page">Visa requirements</li>
        </ol>
      </nav>
      <h1>Visa requirements</h1>
      <div className="page-head">
        <p>{loaded && `Destination: ${loaded.view.destination}`}</p>
        <span className="cluster text-sm text-muted">
          <span>
            {loaded && `Rules published by provider on ${formatDate(loaded.view.published_on)}`}
          </span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={reload}>
            Refresh rules
          </button>
        </span>
      </div>
      {!loaded ? (
        <div className="grid" role="status" aria-label="Loading visa rules">
          {[0, 1, 2].map((n) => (
            <div className="card" key={n}>
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid">
          {loaded.view.travellers.map((row) => (
            <article className="card traveller-card stack stack-sm" key={keyOf(row)}>
              <h3>{row.name}</h3>
              <p className="text-sm text-muted">
                Citizenship: {row.citizenship || 'Not yet entered'} · Residence:{' '}
                {row.residence || 'Not yet entered'}
              </p>
              {row.status === null ? (
                <div className="verdict">
                  <span className="badge badge-warning">
                    <AlertIcon />
                    Details needed
                  </span>
                  {row.traveller_id ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      aria-label={`Enter details for ${row.name}`}
                      onClick={() => setEditing(row.traveller_id)}
                    >
                      Enter details
                    </button>
                  ) : (
                    <Link className="btn btn-ghost btn-sm" to="/profile">
                      Enter details in your profile
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="verdict">
                    <VisaStatusBadge status={row.status} />
                  </div>
                  <p>{row.message}</p>
                </>
              )}
              {row.guidance && (
                <section className="stack stack-sm">
                  <h4>Visa guidance for {row.guidance.country}</h4>
                  <p className="text-sm">
                    <span className="text-muted">Entry requirement:</span>{' '}
                    {row.guidance.entry_requirement}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted">Maximum stay:</span> {row.guidance.max_stay}
                  </p>
                  <p className="text-sm text-muted">Required documents</p>
                  <ul className="text-sm">
                    {row.guidance.documents.map((doc) => (
                      <li key={doc}>{doc}</li>
                    ))}
                  </ul>
                </section>
              )}
              {row.confirm_note && (
                <p className="confirm">
                  <InfoIcon />
                  {row.confirm_note}
                </p>
              )}
              {row.status === 'no_data' && (
                <>
                  {row.official_site_url && (
                    <p>
                      <a href={row.official_site_url} target="_blank" rel="noopener noreferrer">
                        {loaded.view.destination || 'Destination'} official government site
                      </a>
                    </p>
                  )}
                  <div className="stack stack-sm">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      aria-pressed={row.marked_self_check}
                      onClick={() => mark(row)}
                    >
                      I'll check myself
                    </button>
                    <p className="text-sm text-muted" role="status">
                      {row.marked_self_check
                        ? 'Marked as "I\'ll check myself". It shows as unresolved on your trip plan.'
                        : 'Not marked yet. Check the official site, then mark it so your plan keeps track.'}
                    </p>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {loaded && editingTraveller && (
        <CompanionDetailsDrawer
          tripId={tripId}
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
