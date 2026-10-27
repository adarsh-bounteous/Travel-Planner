import { formatConverted, type Conversion } from './convertApi'

type Props = {
  budget: number | null
  currency: string
  target: string
  conversion: Conversion | undefined
}

/** The trip budget in its own currency, and converted to the chosen "Show in" currency. */
export function BudgetPanel({ budget, currency, target, conversion }: Props) {
  if (budget == null) return <p className="card">No budget set. Add one by editing your trip.</p>
  const original = `Budget ${formatConverted(budget, currency)}`
  return (
    <div className="card stack stack-sm">
      <p>{conversion?.supported === false ? `Budget ${budget} ${currency}` : original}</p>
      {conversion?.supported === false ? (
        <p className="cost-unsupported-message" role="alert">
          Currency not supported.
        </p>
      ) : (
        <div className="budget-stat" role="group" aria-labelledby="budget-stat-label">
          <span className="text-muted text-sm" id="budget-stat-label">{`Budget in ${target}`}</span>
          <span className="stat-value">
            {conversion?.supported ? formatConverted(conversion.amount, conversion.currency) : '…'}
          </span>
        </div>
      )}
    </div>
  )
}
