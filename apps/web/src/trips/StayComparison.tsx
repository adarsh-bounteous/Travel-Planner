import type { Shortlist } from './api'
import { FitBar, OfferChips, OverBudget } from './StayShortlistCard'
import { comparisonMarks, formatMoney, plural } from './stayOptions'

const Mark = ({ label }: { label: string }) => <span className="badge badge-success">{label}</span>

/** The shortlisted stays side by side: total price, preference fit and offers, with the leaders marked. */
export function StayComparison({ shortlist }: { shortlist: Shortlist }) {
  const marks = comparisonMarks(shortlist.stays)
  const count = shortlist.stays.length
  return (
    <div className="compare-grid">
      {shortlist.stays.map((s) => {
        const id = s.property.id
        return (
          <article className="card stay-card" key={id} aria-label={s.property.name}>
            <div className="compare-head">
              <span className="compare-key">{`Rank ${s.rank} of ${count}`}</span>
              <h3>{s.property.name}</h3>
              <span className="badges">
                {s.fits_budget ? <Mark label="Within budget" /> : <OverBudget stay={s} />}
              </span>
            </div>
            <div>
              <div className="compare-key">Total price</div>
              <div className="stay-total">{formatMoney(s.total, s.currency)}</div>
              <div className="text-sm text-muted">{plural(shortlist.nights, 'night', 'nights')}</div>
              {marks.lowestPrice.includes(id) && <Mark label="Lowest price" />}
            </div>
            <div>
              <FitBar fit={s.fit} />
              {marks.bestFit.includes(id) && <Mark label="Best fit" />}
            </div>
            <div>
              <div className="compare-key">{`Offers (${s.property.amenities.length})`}</div>
              <OfferChips stay={s} />
              {marks.mostOffers.includes(id) && <Mark label="Most offers" />}
            </div>
          </article>
        )
      })}
    </div>
  )
}
