import { useEffect, useState } from 'react'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { Link, useParams } from 'react-router'
import { AlertIcon, CheckIcon, InfoIcon, UserIcon } from '../auth/icons'
import { CompareTable } from '../components/CompareTable'
import { fetchInsuranceOptions, fetchTrip } from './api'
import type { InsuranceOptions } from './api'
import { compareState } from './insuranceCompare'
import { InsuranceDisclaimer, ProviderUnavailable } from './InsuranceNotices'
import { openProviderSite } from './providerSite'
import { formatMoney } from './TripTotalCard'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; options: InsuranceOptions }

/** Every shortlisted plan side by side, in shortlist order. A table on desktop, one card per plan on phones. */
export function InsuranceComparePage() {
  const { tripId = '' } = useParams()
  const shortlistHref = `/trips/${encodeURIComponent(tripId)}/insurance-options`
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [siteFailed, setSiteFailed] = useState<string | null>(null)

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => setPickedId(trip.insurance?.plan_id ?? null))
      .catch(() => undefined)
    fetchInsuranceOptions(tripId)
      .then((options) => setResult({ state: 'ready', options }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  const status = result.state === 'ready' ? compareState(result.options) : null
  const plans = result.state === 'ready' && status?.kind === 'ready' ? result.options.plans : []

  return (
    <div className="stack stack-lg">
      <Link className="text-sm" to={shortlistHref}>
        Back to shortlist
      </Link>
      <h1>Compare plans</h1>
      <InsuranceDisclaimer />
      {result.state === 'loading' && (
        <div className="stack" role="status" aria-label="Loading plans">
          {[1, 2, 3].map((n) => (
            <div className="card" key={n}>
              <span className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {result.state === 'failed' && (
        <div className="alert alert-danger cluster" role="alert">
          <AlertIcon />
          We couldn't load insurance plans. Check your connection and try again.
        </div>
      )}
      {status?.kind === 'too-few' && (
        <div className="empty-state">
          <EmptyStateArt />
          <InfoIcon />
          <h2>Nothing to compare yet</h2>
          <p>You need at least 2 plans to compare. Change your trip dates or travellers to see more plans.</p>
          <Link className="btn btn-primary" to={shortlistHref}>
            Back to insurance options
          </Link>
        </div>
      )}
      {status?.kind === 'missing-age' && (
        <div className="empty-state">
          <EmptyStateArt />
          <UserIcon />
          <h2>We need a traveller's age</h2>
          <p>
            Add the missing traveller details to compare plans. {status.names.join(', ')}{' '}
            {status.names.length === 1 ? 'has' : 'have'} no age yet.
          </p>
          <Link
            className="btn btn-primary"
            to={`${shortlistHref}#${status.names.includes('You') ? 'owner-age' : 'companion-ages'}`}
          >
            Add traveller details
          </Link>
        </div>
      )}
      {siteFailed !== null && <ProviderUnavailable picked={siteFailed === pickedId} />}
      {plans.length > 0 && (
        <CompareTable
          caption="Shortlisted insurance plans side by side"
          rows={plans}
          rowKey={(plan) => plan.plan_id}
          title={(plan) => plan.name}
          badges={(plan) =>
            plan.plan_id === pickedId && (
              <span className="badge badge-success">
                <CheckIcon /> Picked
              </span>
            )
          }
          columns={[
            { key: 'reason', header: 'Reason', render: (plan) => plan.reason },
            {
              key: 'prices',
              header: 'Traveller prices',
              render: (plan) => (
                <ul>
                  {plan.traveller_prices.map((t) => (
                    <li key={t.label}>
                      {t.label}: {formatMoney(Number(t.price), plan.currency)}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              key: 'total',
              header: 'Group total',
              render: (plan) => <strong>{formatMoney(Number(plan.group_total), plan.currency)}</strong>,
            },
            {
              key: 'site',
              header: 'Provider site',
              render: (plan) => (
                <a
                  href={plan.url}
                  onClick={(event) => {
                    event.preventDefault()
                    setSiteFailed(openProviderSite(plan.url) ? null : plan.plan_id)
                  }}
                >
                  Go to provider site
                </a>
              ),
            },
          ]}
        />
      )}
      {plans.length > 0 && (
        <div>
          <Link className="btn btn-secondary" to={shortlistHref}>
            Back to insurance options
          </Link>
        </div>
      )}
    </div>
  )
}
