import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { CheckIcon, InfoIcon, RefreshIcon, SearchIcon } from '../auth/icons'
import { fetchVisa, fetchVisaProviders, setVisaSelfCheck } from './api'
import type { VisaProviderView, VisaResult } from './api'
import { Toast } from './Toast'
import { VisaProviderCard } from './VisaProviderCard'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; travellers: VisaResult[]; view: VisaProviderView }

const CONFIRM_NOTE = 'Confirm with official sources.'
const keyOf = (row: VisaResult) => row.traveller_id ?? 'owner'

/** Owner only: one traveller's shortlist of visa application providers, picked by following the provider's own link. */
export function VisaProvidersPage() {
  const { tripId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const requested = params.get('traveller')

  useEffect(() => {
    let current = true
    fetchVisa(tripId)
      .then(async ({ travellers }) => {
        const who = travellers.find((t) => keyOf(t) === requested) ?? travellers[0]
        if (!who) throw new Error('no travellers')
        return { travellers, view: await fetchVisaProviders(tripId, keyOf(who)) }
      })
      .then(
        (loaded) => current && setLoad({ status: 'loaded', ...loaded }),
        () => current && setLoad({ status: 'failed' }),
      )
    return () => {
      current = false
    }
  }, [tripId, requested, attempt])

  const reload = () => {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }
  const choose = (key: string) => {
    setLoad({ status: 'loading' })
    setParams({ traveller: key })
  }

  const loaded = load.status === 'loaded' ? load : null
  const activeKey = loaded ? (loaded.view.traveller_id ?? 'owner') : requested
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!loaded || !step) return
    const rows = loaded.travellers
    const next = rows[(rows.findIndex((r) => keyOf(r) === activeKey) + step + rows.length) % rows.length]
    choose(keyOf(next))
    document.getElementById(`visa-tab-${keyOf(next)}`)?.focus()
  }

  const markMyself = async () => {
    if (!loaded) return
    try {
      await setVisaSelfCheck(tripId, activeKey ?? 'owner', true)
      setToast({ id: Date.now(), message: 'Visa marked as "I\'ll check myself"' })
    } catch {
      setToast({ id: Date.now(), message: "We couldn't save that mark. Try again." })
    }
  }

  const requirementsPath = `/trips/${encodeURIComponent(tripId)}/visa-requirements`
  const view = loaded?.view
  const country = view?.destination?.country ?? 'Destination'

  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to={`/trips/${encodeURIComponent(tripId)}`}>Trip</Link>
          </li>
          <li>
            <Link to={requirementsPath}>Visa requirements</Link>
          </li>
          <li aria-current="page">Visa providers</li>
        </ol>
      </nav>
      <h1>Visa providers</h1>
      {loaded && (
        <div className="tabs" role="tablist" aria-label="Traveller" onKeyDown={onKeyDown}>
          {loaded.travellers.map((row) => (
            <button
              key={keyOf(row)}
              className="tab"
              role="tab"
              type="button"
              id={`visa-tab-${keyOf(row)}`}
              aria-selected={keyOf(row) === activeKey}
              tabIndex={keyOf(row) === activeKey ? 0 : -1}
              onClick={() => choose(keyOf(row))}
            >
              {row.name}
            </button>
          ))}
        </div>
      )}
      {load.status === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <p>We couldn't load the visa providers. Try again.</p>
          <button className="btn btn-secondary" type="button" onClick={reload}>
            <RefreshIcon />
            Retry
          </button>
        </div>
      )}
      {load.status === 'loading' && (
        <div className="grid provider-cards" role="status" aria-label="Loading visa providers" aria-busy="true">
          {[0, 1, 2].map((n) => (
            <div className="card stack" key={n}>
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {view?.outcome === 'shortlist' && (
        <>
          <p className="text-muted">
            {`${country} ${view.visa_type ?? ''} visa for ${view.citizenship} citizens. Lowest fee first, equal fees by shorter processing time. Showing ${view.providers.length} of ${view.matching_count} matching providers.`}
          </p>
          <div className="grid provider-cards">
            {view.providers.map((option, index) => (
              <VisaProviderCard key={option.id} option={option} primary={index === 0} />
            ))}
          </div>
          <p className="confirm">
            <InfoIcon />
            <span>{CONFIRM_NOTE}</span>
          </p>
        </>
      )}
      {view?.outcome === 'no_data' && (
        <>
          <div className="empty-state" role="status">
            <SearchIcon />
            <h2>No data for this route</h2>
            <p>{view.message}</p>
            {view.official_site_url && (
              <a className="btn btn-secondary" href={view.official_site_url} target="_blank" rel="noopener noreferrer">
                {country} official government site
              </a>
            )}
          </div>
          <div>
            <button className="btn btn-secondary" type="button" onClick={markMyself}>
              <CheckIcon />
              I'll check myself
            </button>
          </div>
        </>
      )}
      {view?.outcome === 'no_visa_needed' && (
        <>
          <div className="alert alert-success" role="status">
            <p>{`No visa is needed for ${view.name} for this trip.`}</p>
          </div>
          <p>
            <Link to={requirementsPath}>Back to visa requirements</Link>
          </p>
        </>
      )}
      {view?.outcome === 'details_needed' && (
        <div className="alert" role="status">
          <p>
            We need {view.name}'s citizenship and residence first. <Link to={requirementsPath}>Back to visa requirements</Link>
          </p>
        </div>
      )}
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </div>
  )
}
