import { Link } from 'react-router'
import { AlertIcon, CheckIcon, InfoIcon, WalletIcon } from '../auth/icons'
import { useCountUp } from '../motion'
import type { CostSummary, InsurancePick } from './api'

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
export function TripTotalCard({
  cost,
  costsHref,
  insurance,
}: {
  cost: CostSummary
  costsHref?: string
  insurance?: InsurancePick | null
}) {
  const { currency } = cost
  const shown = useCountUp(cost.total)
  const counting = shown !== cost.total
  const unpricedRestaurants = cost.restaurant_unpriced_count ?? 0
  const hasRestaurants = (cost.restaurant_total ?? 0) > 0 || unpricedRestaurants > 0
  const missing = cost.missing_categories.map((c) => c.toLowerCase())
  return (
    <section className="card stack stack-sm" aria-label="Trip total">
      <div className="total-row">
        <h2 aria-live="polite">
          <WalletIcon />
          {counting ? (
            <>
              <span aria-hidden="true">{formatMoney(Math.round(shown), currency)}</span>
              <span className="sr-only">{formatMoney(cost.total, currency)}</span>
            </>
          ) : (
            formatMoney(cost.total, currency)
          )}
        </h2>
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
      {insurance && (
        <p className="budget-line">
          <span>{`Insurance: ${insurance.name}`}</span>{' '}
          <span>{formatMoney(Number(insurance.total), insurance.currency)}</span>
        </p>
      )}
      {costsHref && (
        <Link className="btn btn-ghost" to={costsHref}>
          <WalletIcon />
          View costs in another currency
        </Link>
      )}
      {cost.over_budget_by > 0 && (
        <div className="alert alert-warning" role="alert">
          <AlertIcon />
          {`Over budget by ${formatMoney(cost.over_budget_by, currency)}`}
        </div>
      )}
      {cost.budget != null && cost.over_budget_by === 0 && (
        <p className="text-sm">
          <CheckIcon />
          {`${formatMoney(cost.budget - cost.total, currency)} left of your ${formatMoney(cost.budget, currency)} budget.`}
        </p>
      )}
      {hasRestaurants && (
        <dl className="total-lines">
          <dt>Restaurant estimates</dt>
          <dd>{formatMoney(cost.restaurant_total ?? 0, currency)}</dd>
        </dl>
      )}
      {unpricedRestaurants > 0 && (
        <p className="text-muted text-sm">
          {unpricedRestaurants === 1
            ? "1 restaurant has no estimate and isn't counted."
            : `${unpricedRestaurants} restaurants have no estimate and aren't counted.`}
        </p>
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
