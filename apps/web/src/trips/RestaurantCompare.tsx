import { Link } from 'react-router'
import { SearchIcon } from '../auth/icons'
import type { ShortlistEntry } from './api'
import { canCompare } from './restaurantShortlist'
import { formatMoney } from './stayOptions'

/** Every matching restaurant side by side, or a note that two are needed. */
export function RestaurantCompare({ entries, optionsHref }: { entries: ShortlistEntry[]; optionsHref: string }) {
  if (!canCompare(entries))
    return (
      <div className="empty-state" role="status">
        <SearchIcon />
        <h2>Nothing to compare</h2>
        <p>This trip has fewer than 2 matching restaurants. Check the shortlist, or relax a filter to find more.</p>
        <div className="cluster">
          <Link className="btn btn-primary" to={optionsHref}>
            Back to restaurant options
          </Link>
        </div>
      </div>
    )
  return (
    <section aria-label="Matching restaurants side by side">
      <div className="grid" data-testid="comparison">
        {entries.map(({ restaurant: r }) => (
          <article key={`${r.name}-${r.city}`} className="card compare-card" aria-label={r.name}>
            <h3>{r.name}</h3>
            <p>
              <span className="fact-label">Cuisine:</span> {r.cuisine}
            </p>
            <p>
              <span className="fact-label">Dining style:</span> {r.dining_style}
            </p>
            <p>
              <span className="fact-label">Typical price per person:</span>{' '}
              <strong>
                {r.typical_price === null ? 'Typical price not available' : formatMoney(r.typical_price, r.currency)}
              </strong>
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
