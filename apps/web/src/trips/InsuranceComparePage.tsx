import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { AlertIcon, CheckIcon } from '../auth/icons'
import { CompareTable } from '../components/CompareTable'
import { fetchInsuranceOptions, fetchTrip } from './api'
import type { InsurancePlan } from './api'
import { InsuranceDisclaimer, ProviderUnavailable } from './InsuranceNotices'
import { openProviderSite } from './providerSite'
import { formatMoney } from './TripTotalCard'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; plans: InsurancePlan[] }

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
      .then((options) => setResult({ state: 'ready', plans: options.plans }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  if (result.state === 'ready' && result.plans.length < 2) return <Navigate to={shortlistHref} replace />
  const plans = result.state === 'ready' ? result.plans : []

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
    </div>
  )
}
