import { CheckIcon } from '../auth/icons'
import { OptionCard } from '../components/OptionCard'
import type { InsurancePlan } from './api'
import { formatMoney } from './TripTotalCard'

type InsurancePlanCardProps = {
  plan: InsurancePlan
  picked: boolean
  busy: boolean
  onPick: () => void
  onRemove: () => void
  onOpenSite: () => void
}

/** One ranked plan: why it is here, each traveller's price and the group total. Booking is on the provider's site. */
export function InsurancePlanCard({ plan, picked, busy, onPick, onRemove, onOpenSite }: InsurancePlanCardProps) {
  const money = (amount: string) => formatMoney(Number(amount), plan.currency)
  return (
    <OptionCard
      title={plan.name}
      picked={picked}
      badges={
        <>
          <span className="badge badge-neutral">{plan.rank === 1 ? 'Best fit' : `Place ${plan.rank}`}</span>
          {picked && (
            <span className="badge badge-success">
              <CheckIcon /> Picked
            </span>
          )}
          {plan.offer && <span className="badge badge-neutral">Offer: {plan.offer}</span>}
        </>
      }
      meta={plan.reason}
      price={
        <div>
          <table className="price-table">
            <thead className="sr-only">
              <tr>
                <th>Traveller</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {plan.traveller_prices.map((t) => (
                <tr key={t.label}>
                  <th scope="row">{t.label}</th>
                  <td>{money(t.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="group-total">
            <span>Group total</span>
            <span>{money(plan.group_total)}</span>
          </div>
        </div>
      }
      actions={
        <>
          <button
            className={`btn ${picked ? 'btn-secondary' : 'btn-primary'}`}
            type="button"
            aria-pressed={picked}
            disabled={busy}
            onClick={picked ? onRemove : onPick}
          >
            {picked ? 'Remove pick' : 'Pick plan'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onOpenSite}>
            Go to provider site
          </button>
        </>
      }
    />
  )
}
