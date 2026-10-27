import { Link } from 'react-router'
import { AlertIcon, InfoIcon } from '../auth/icons'
import type { CostSummary } from './api'

const amountFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

/** Money always carries its currency code: mixed currencies cause costly mistakes. */
export const formatMoney = (amount: number, currency: string) =>
  `${amountFormat.format(amount)} ${currency}`

const joinNames = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const noPriceNote = (count: number) =>
  count === 1
    ? 'One chosen option has no price and is not in the total.'
    : `${count} chosen options have no price and are not in the total.`

/** The trip total in the trip currency against the budget, as worked out by the server. */
export function TripTotalCard({ cost, costsHref }: { cost: CostSummary; costsHref?: string }) {
  const { currency } = cost
  const missing = cost.missing_categories.map((c) => c.toLowerCase())
  return (
    <section className="card stack stack-sm" aria-label="Trip total">
      <div className="total-row">
        <h1 aria-live="polite">{formatMoney(cost.total, currency)}</h1>
        <span className="fx-rate">
          {cost.rates.length > 0
            ? cost.rates
                .map((r) => `${r.currency} converted at 1 ${r.currency} = ${r.rate} ${currency}`)
                .join('. ')
            : `All chosen options are priced in ${currency}, so no conversion was needed.`}
        </span>
      </div>
      <p className="budget-line">
        {cost.budget == null ? 'No budget set' : `Budget ${formatMoney(cost.budget, currency)}`}
      </p>
      {costsHref && (
        <Link className="btn btn-ghost" to={costsHref}>
          View costs in another currency
        </Link>
      )}
      {cost.over_budget_by > 0 && (
        <span className="badge badge-danger" role="alert">
          <AlertIcon />
          {`Over budget by ${formatMoney(cost.over_budget_by, currency)}`}
        </span>
      )}
      {missing.length > 0 && (
        <span className="badge badge-warning">
          <InfoIcon />
          {`Plan incomplete: ${joinNames(missing)} still ${missing.length === 1 ? 'needs' : 'need'} a pick`}
        </span>
      )}
      {cost.unpriced_count > 0 && (
        <p className="note-line">
          <InfoIcon />
          {noPriceNote(cost.unpriced_count)}
        </p>
      )}
    </section>
  )
}
