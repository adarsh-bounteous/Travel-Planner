import { Link } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { SearchIcon } from '../auth/icons'
import { CompareTable } from '../components/CompareTable'
import type { ShortlistEntry } from './api'
import { canCompare } from './restaurantShortlist'
import { formatMoney } from './stayOptions'

/** Every matching restaurant side by side, or a note that two are needed. */
export function RestaurantCompare({ entries, optionsHref }: { entries: ShortlistEntry[]; optionsHref: string }) {
  if (!canCompare(entries))
    return (
      <div className="empty-state" role="status">
        <EmptyStateArt />
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
    <section aria-label="Matching restaurants side by side" data-testid="comparison">
      <CompareTable
        caption="Matching restaurants side by side"
        rows={entries.map((e) => e.restaurant)}
        rowKey={(r) => `${r.name}-${r.city}`}
        title={(r) => r.name}
        columns={[
          { key: 'cuisine', header: 'Cuisine', render: (r) => r.cuisine },
          { key: 'style', header: 'Dining style', render: (r) => r.dining_style },
          {
            key: 'price',
            header: 'Typical price per person',
            render: (r) => (
              <strong>
                {r.typical_price === null ? 'Typical price not available' : formatMoney(r.typical_price, r.currency)}
              </strong>
            ),
          },
        ]}
      />
    </section>
  )
}
