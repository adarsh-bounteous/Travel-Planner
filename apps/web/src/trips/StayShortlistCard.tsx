import { AlertIcon, CheckIcon } from '../auth/icons'
import type { ShortlistStay } from './api'
import { amenityLabel, formatMoney, plural } from './stayOptions'

export function FitBar({ fit }: { fit: number }) {
  return (
    <div className="metric">
      <div className="fit-label">
        <span>Preference fit</span>
        <span className="text-bold">{`${fit}%`}</span>
      </div>
      <div className="fit-bar" role="img" aria-label={`Preference fit ${fit} percent`}>
        <span style={{ width: `${fit}%` }} />
      </div>
    </div>
  )
}

export function OfferChips({ stay }: { stay: ShortlistStay }) {
  return (
    <div className="cluster" role="list" aria-label="Offers">
      {stay.property.amenities.map((a) => (
        <span className="chip" role="listitem" key={a}>
          {amenityLabel(a)}
        </span>
      ))}
    </div>
  )
}

export const OverBudget = ({ stay }: { stay: ShortlistStay }) => (
  <span className="badge badge-warning">
    <AlertIcon />
    {`${formatMoney(stay.over_budget_by, stay.currency)} over budget`}
  </span>
)

type CardProps = {
  stay: ShortlistStay
  nights: number
  chosen?: boolean
  busy?: boolean
  /** Omitted for travellers who cannot edit the trip: no Choose button is shown. */
  onChoose?: () => void
}

/** One ranked stay: its rank, the reason for it, the total, the preference fit and the offers. */
export function StayShortlistCard({ stay, nights, chosen = false, busy = false, onChoose }: CardProps) {
  const perNight = formatMoney(Number(stay.total) / nights, stay.currency)
  return (
    <article className="card stay-card" aria-label={`${stay.property.name}, rank ${stay.rank}`}>
      <div className="row-between">
        <span className="badge badge-neutral">
          <span className="sr-only">Rank </span>
          {stay.rank}
        </span>
        <span className="badges">
          <span className={`badge ${stay.fits_budget ? 'badge-success' : 'badge-neutral'}`}>{stay.reason}</span>
          {!stay.fits_budget && <OverBudget stay={stay} />}
        </span>
      </div>
      <h3>{stay.property.name}</h3>
      <p className="text-sm text-muted">{stay.why}</p>
      <div>
        <div className="stay-total">{formatMoney(stay.total, stay.currency)}</div>
        <div className="text-sm text-muted">
          {`Total price for ${plural(nights, 'night', 'nights')}, ${perNight} per night`}
        </div>
      </div>
      <FitBar fit={stay.fit} />
      <div className="metric">
        <span className="text-sm">Offers</span>
        <OfferChips stay={stay} />
      </div>
      {onChoose && (
        <div>
          <button
            className="btn btn-secondary"
            type="button"
            data-choose
            aria-pressed={chosen}
            disabled={chosen || busy}
            onClick={onChoose}
          >
            {chosen ? (
              <>
                <CheckIcon />
                Chosen
              </>
            ) : busy ? (
              'Choosing…'
            ) : (
              <>
                Choose stay
                <span className="sr-only">{`: ${stay.property.name}`}</span>
              </>
            )}
          </button>
        </div>
      )}
    </article>
  )
}
