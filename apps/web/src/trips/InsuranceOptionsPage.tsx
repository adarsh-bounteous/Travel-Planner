import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AlertIcon, SearchIcon } from '../auth/icons'
import { chooseInsurance, clearInsurance, fetchInsuranceOptions, fetchTrip } from './api'
import type { InsuranceOptions } from './api'
import { InsuranceDisclaimer, ProviderUnavailable } from './InsuranceNotices'
import { InsurancePlanCard } from './InsurancePlanCard'
import { openProviderSite } from './providerSite'
import { Toast } from './Toast'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; options: InsuranceOptions }

const agesText = (options: InsuranceOptions) => {
  const ages = options.travellers.map((t) => t.age).filter((a): a is number => a !== null)
  return ages.length < 2 ? ages.join('') : `${ages.slice(0, -1).join(', ')} and ${ages[ages.length - 1]}`
}

/** The ranked insurance shortlist for a trip: pick one, then follow its link to the provider's site. */
export function InsuranceOptionsPage() {
  const { tripId = '' } = useParams()
  const tripHref = `/trips/${encodeURIComponent(tripId)}`
  const [result, setResult] = useState<Load>({ state: 'loading' })
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [siteFailed, setSiteFailed] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchTrip(tripId)
      .then((trip) => setPickedId(trip.insurance?.plan_id ?? null))
      .catch(() => undefined)
    fetchInsuranceOptions(tripId)
      .then((options) => setResult({ state: 'ready', options }))
      .catch(() => setResult({ state: 'failed' }))
  }, [tripId])

  const change = async (planId: string | null) => {
    setBusy(true)
    try {
      const trip = planId === null ? await clearInsurance(tripId) : await chooseInsurance(tripId, planId)
      setPickedId(trip.insurance?.plan_id ?? null)
      setToast({
        id: Date.now(),
        message:
          planId === null
            ? 'Pick removed. Your trip total no longer includes insurance.'
            : 'Picked. Your trip total and Book trip links now include this plan.',
      })
    } catch {
      setToast({ id: Date.now(), message: "We couldn't save that change. Try again." })
    } finally {
      setBusy(false)
    }
  }

  const options = result.state === 'ready' ? result.options : null
  const plans = options?.plans ?? []
  return (
    <div className="stack stack-lg">
      <Link className="text-sm" to={tripHref}>
        Back to trip
      </Link>
      <h1>Insurance options</h1>
      {result.state === 'failed' && (
        <div className="alert alert-danger cluster" role="alert">
          <AlertIcon />
          We couldn't load insurance options. Check your connection and try again.
        </div>
      )}
      {result.state === 'loading' && (
        <div className="stack" role="status" aria-label="Loading insurance options">
          {[1, 2, 3].map((n) => (
            <div className="card" key={n}>
              <span className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {options && options.missing.length > 0 && (
        <div className="alert alert-warning" role="status">
          <span className="alert-title">We need a few more details.</span> Add {options.missing.join(', ')} to this
          trip, then check again.
        </div>
      )}
      {options && options.missing.length === 0 && plans.length === 0 && (
        <>
          <div className="empty-state">
            <SearchIcon />
            <h2 className="text-lg">No plans suit this trip.</h2>
            <p className="text-muted">
              We couldn't match a plan to this destination, trip length and these travellers. Try changing your trip
              details and check again.
            </p>
          </div>
          <p>Insurance: not yet picked</p>
        </>
      )}
      {plans.length > 0 && options && (
        <>
          <InsuranceDisclaimer />
          <p className="text-sm text-muted">
            Best fit first for {options.place}, {options.days} {options.days === 1 ? 'day' : 'days'}, travellers aged{' '}
            {agesText(options)}, {options.risky_activities ? 'with' : 'without'} risky activities. Price, offers and
            provider commission never change the order. Prices are for {options.travellers.length}{' '}
            {options.travellers.length === 1 ? 'traveller' : 'travellers'}.
          </p>
          {siteFailed !== null && <ProviderUnavailable picked={siteFailed === pickedId} />}
          <div className="stack" aria-live="polite">
            {plans.map((plan) => (
              <InsurancePlanCard
                key={plan.plan_id}
                plan={plan}
                picked={plan.plan_id === pickedId}
                busy={busy}
                onPick={() => change(plan.plan_id)}
                onRemove={() => change(null)}
                onOpenSite={() => setSiteFailed(openProviderSite(plan.url) ? null : plan.plan_id)}
              />
            ))}
          </div>
          {plans.length >= 2 && (
            <div>
              <Link className="btn btn-secondary" to={`${tripHref}/insurance-options/compare`}>
                Compare plans
              </Link>
            </div>
          )}
        </>
      )}
      {options && options.missing.length > 0 && <InsuranceDisclaimer />}
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </div>
  )
}
