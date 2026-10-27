import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AlertIcon } from '../auth/icons'
import { fetchTrip } from './api'
import type { Trip } from './api'
import { BudgetPanel } from './BudgetPanel'
import { convertCost, formatConverted, OFFERED_CURRENCIES } from './convertApi'
import type { Conversion } from './convertApi'
import { formatMoney } from './TripTotalCard'

type CostLine = { id: string; name: string; amount: number; currency: string }

const BUDGET_ID = 'budget'
const SKELETON_WIDTHS = ['50%', '30%', '60%']

/** Every priced item the trip already holds: chosen options, chosen stays and transport picks. */
function costLines(trip: Trip): CostLine[] {
  const lines: CostLine[] = []
  for (const o of trip.options ?? [])
    if (o.price != null && o.currency)
      lines.push({ id: `option-${o.id}`, name: o.title, amount: o.price, currency: o.currency })
  for (const s of trip.stays ?? [])
    if (s.chosen)
      lines.push({
        id: `stay-${s.id}`,
        name: s.chosen.name,
        amount: Number(s.chosen.total),
        currency: s.chosen.currency,
      })
  for (const p of trip.transport ?? [])
    lines.push({
      id: `transport-${p.leg}`,
      name: `${p.origin} to ${p.destination}`,
      amount: Number(p.picked_fare),
      currency: p.currency,
    })
  if (trip.sim)
    lines.push({
      id: 'sim',
      name: `SIM: ${trip.sim.name}`,
      amount: Number(trip.sim.price) * (trip.traveller_count ?? 1),
      currency: trip.sim.currency,
    })
  return lines
}

/** An offered currency keeps fixed decimals; any other code is shown as given. */
const formatOriginal = (line: CostLine) =>
  OFFERED_CURRENCIES.includes(line.currency)
    ? formatConverted(line.amount, line.currency)
    : formatMoney(line.amount, line.currency)

function CostRow({ line, conversion }: { line: CostLine; conversion: Conversion }) {
  if (!conversion.supported)
    return (
      <div className="card cost-row is-unsupported">
        <span className="cost-name">{line.name}</span>
        <div className="cost-amount">
          <span className="cost-original">{formatOriginal(line)}</span>
          <span className="cost-unsupported-message" role="alert">
            <AlertIcon />
            Currency not supported. {conversion.message}
          </span>
        </div>
      </div>
    )
  return (
    <div className="card cost-row">
      <span className="cost-name">{line.name}</span>
      <div className="cost-amount">
        <span className="cost-original">{formatOriginal(line)}</span>
        <span className="cost-converted">{formatConverted(conversion.amount, conversion.currency)}</span>
      </div>
    </div>
  )
}

/** Trip costs and budget shown in one chosen currency, converted by the server's rate source. */
export function CostsPage() {
  const { tripId = '' } = useParams()
  const [query] = useSearchParams()
  const showBudget = query.get('tab') === 'budget'
  const [trip, setTrip] = useState<Trip | null>(null)
  const [failed, setFailed] = useState(false)
  const [target, setTarget] = useState(OFFERED_CURRENCIES[0])
  const [results, setResults] = useState<Record<string, Conversion> | null>(null)

  useEffect(() => {
    fetchTrip(tripId)
      .then(setTrip)
      .catch(() => setFailed(true))
  }, [tripId])

  const lines = useMemo(() => (trip ? costLines(trip) : []), [trip])
  const tripCurrency = trip?.currency ?? trip?.cost?.currency ?? 'EUR'

  useEffect(() => {
    if (!trip) return
    let current = true
    setResults(null)
    const asks = [...lines.map((l) => ({ id: l.id, amount: l.amount, from: l.currency }))]
    if (trip.budget != null) asks.push({ id: BUDGET_ID, amount: trip.budget, from: tripCurrency })
    Promise.all(asks.map((a) => convertCost(a.amount, a.from, target)))
      .then((answers) => {
        if (current) setResults(Object.fromEntries(asks.map((a, i) => [a.id, answers[i]])))
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [trip, lines, tripCurrency, target])

  if (failed)
    return (
      <div className="inbox-col stack">
        <div className="alert alert-danger" role="alert">
          <span className="alert-title">We couldn't load your costs.</span> Go back to your trip and try again.
        </div>
      </div>
    )

  const base = `/trips/${encodeURIComponent(tripId)}/costs`
  return (
    <div className="inbox-col stack">
      <h1>{showBudget ? 'Budget' : 'Costs'}</h1>
      <div className="tabs" role="tablist">
        <Link className="tab" role="tab" to={base} aria-selected={!showBudget}>
          Costs
        </Link>
        <Link className="tab" role="tab" to={`${base}?tab=budget`} aria-selected={showBudget}>
          Budget
        </Link>
      </div>
      <div className="alert alert-info" role="status">
        <span className="alert-title">Local mode is on.</span> Amounts use the local rate table, not the
        outside rates service. <span className="rate-line">1 EUR = 1.08 USD.</span>
      </div>
      <div className="field select-wrap">
        <label className="field-label" htmlFor="show-in">
          Show in
        </label>
        <select
          className="select"
          id="show-in"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {OFFERED_CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {showBudget ? (
        <BudgetPanel
          budget={trip?.budget ?? null}
          currency={tripCurrency}
          target={target}
          conversion={results?.[BUDGET_ID]}
        />
      ) : (
        <div className="stack" aria-live="polite" aria-label="Trip costs">
          {!trip || !results ? (
            SKELETON_WIDTHS.map((width) => (
              <span key={width} className="skeleton" style={{ width }} aria-hidden="true" />
            ))
          ) : lines.length === 0 ? (
            <p className="text-muted">No priced options yet. Pick a stay or a trip option to see costs here.</p>
          ) : (
            lines.map((l) => <CostRow key={l.id} line={l} conversion={results[l.id]} />)
          )}
        </div>
      )}
    </div>
  )
}
