import { useEffect, useState } from 'react'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { Link, useParams } from 'react-router'
import { AlertIcon, InfoIcon, SearchIcon } from '../auth/icons'
import {
  addTraveller,
  chooseInsurance,
  clearInsurance,
  fetchInsuranceOptions,
  fetchTrip,
  removeTraveller,
  saveInsuranceDetails,
} from './api'
import type { InsuranceOptions, Trip } from './api'
import { compareState } from './insuranceCompare'
import { InsuranceDetailsForm } from './InsuranceDetailsForm'
import type { InsuranceDetails } from './InsuranceDetailsForm'
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
  const [trip, setTrip] = useState<Trip | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [siteFailed, setSiteFailed] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchTrip(tripId)
      .then((loaded) => {
        setTrip(loaded)
        setPickedId(loaded.insurance?.plan_id ?? null)
      })
      .catch(() => setResult({ state: 'failed' }))
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

  /** Saves the details, matches the companions to travellers, then asks again for plans. */
  const compare = async ({ ownerAge, companionAges, activities }: InsuranceDetails) => {
    if (!trip) return
    setSaving(true)
    setSaveFailed(false)
    try {
      await saveInsuranceDetails(trip, ownerAge, activities.length > 0)
      // Only travellers the form shows (those with an age) are touched: keep those whose age is still
      // wanted, remove the ones dropped from the form, then add what is left. The rest stay as they are.
      const wanted = [...companionAges]
      let latest = trip
      for (const traveller of trip.travellers ?? []) {
        if (traveller.age == null) continue
        const at = wanted.indexOf(traveller.age)
        if (at >= 0) wanted.splice(at, 1)
        else latest = await removeTraveller(tripId, traveller.id)
      }
      const kept = (latest.travellers ?? []).length
      for (const [i, age] of wanted.entries()) latest = await addTraveller(tripId, `Companion ${kept + i + 1}`, age)
      setTrip({ ...latest, owner_age: ownerAge, risky_activities: activities.length > 0 })
      setResult({ state: 'ready', options: await fetchInsuranceOptions(tripId) })
    } catch {
      setSaveFailed(true)
      // A partial save may have changed travellers: resync so a retry compares against what is stored.
      await fetchTrip(tripId).then(setTrip, () => undefined)
    } finally {
      setSaving(false)
    }
  }

  const options = result.state === 'ready' ? result.options : null
  const needsOnTrip = options?.missing.filter((item) => item === 'destination' || item === 'trip dates') ?? []
  const plans = options?.plans ?? []
  const compareHref = `${tripHref}/insurance-options/compare`
  const compareStatus = options && needsOnTrip.length === 0 ? compareState(options) : null
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
      {needsOnTrip.length > 0 && (
        <div className="alert alert-warning" role="status">
          <span className="alert-title">We need a few more details.</span> Add {needsOnTrip.join(', ')} to this trip,
          then check again.
        </div>
      )}
      {options && trip && (
        <InsuranceDetailsForm
          initialOwnerAge={trip.owner_age ?? null}
          initialCompanionAges={(trip.travellers ?? []).flatMap((t) => (t.age == null ? [] : [t.age]))}
          busy={saving}
          failed={saveFailed}
          onCompare={compare}
        />
      )}
      {compareStatus?.kind === 'missing-age' && (
        <div className="alert alert-warning cluster" role="alert">
          <AlertIcon />
          <p id="compare-reason">
            Add the missing traveller details to compare plans. {compareStatus.names.join(', ')}{' '}
            {compareStatus.names.length === 1 ? 'has' : 'have'} no age yet.
          </p>
          <a className="text-bold" href={compareStatus.names.includes('You') ? '#owner-age' : '#companion-ages'}>
            Add traveller details
          </a>
        </div>
      )}
      {compareStatus && (
        <div className="compare-bar">
          <span className="text-bold">
            {plans.length} {plans.length === 1 ? 'plan' : 'plans'} for your trip
          </span>
          {compareStatus.kind === 'ready' ? (
            <Link className="btn btn-secondary" to={compareHref}>
              Compare
            </Link>
          ) : (
            <button className="btn btn-secondary" type="button" disabled aria-describedby="compare-reason">
              Compare
            </button>
          )}
        </div>
      )}
      {compareStatus?.kind === 'too-few' && (
        <div className="alert alert-info cluster" role="status">
          <InfoIcon />
          <p id="compare-reason">
            Compare needs at least 2 plans. Change your trip dates or travellers to see more plans.
          </p>
        </div>
      )}
      {options && options.missing.length === 0 && plans.length === 0 && (
        <>
          <div className="empty-state">
            <EmptyStateArt />
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
        </>
      )}
      {options && options.missing.length > 0 && <InsuranceDisclaimer />}
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </div>
  )
}
