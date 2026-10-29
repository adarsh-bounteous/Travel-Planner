import { CompareTable } from '../components/CompareTable'
import type { Shortlist } from './api'
import { FitBar, OfferChips, OverBudget } from './StayShortlistCard'
import { comparisonMarks, formatMoney, plural } from './stayOptions'

const Mark = ({ label }: { label: string }) => <span className="badge badge-success">{label}</span>

/** The shortlisted stays side by side: total price, preference fit and offers, with the leaders marked. */
export function StayComparison({ shortlist }: { shortlist: Shortlist }) {
  const marks = comparisonMarks(shortlist.stays)
  const count = shortlist.stays.length
  return (
    <CompareTable
      caption="Shortlisted stays side by side"
      rows={shortlist.stays}
      rowKey={(s) => s.property.id}
      title={(s) => s.property.name}
      badges={(s) => (
        <>
          <span className="badge badge-neutral">{`Rank ${s.rank} of ${count}`}</span>
          {s.fits_budget ? <Mark label="Within budget" /> : <OverBudget stay={s} />}
        </>
      )}
      columns={[
        {
          key: 'total',
          header: 'Total price',
          render: (s) => (
            <>
              <div className="stay-total">{formatMoney(s.total, s.currency)}</div>
              <div className="text-sm text-muted">{plural(shortlist.nights, 'night', 'nights')}</div>
              {marks.lowestPrice.includes(s.property.id) && <Mark label="Lowest price" />}
            </>
          ),
        },
        {
          key: 'fit',
          header: 'Preference fit',
          render: (s) => (
            <>
              <FitBar fit={s.fit} />
              {marks.bestFit.includes(s.property.id) && <Mark label="Best fit" />}
            </>
          ),
        },
        {
          key: 'offers',
          header: 'Offers',
          render: (s) => (
            <>
              <div className="compare-key">{`Offers (${s.property.amenities.length})`}</div>
              <OfferChips stay={s} />
              {marks.mostOffers.includes(s.property.id) && <Mark label="Most offers" />}
            </>
          ),
        },
      ]}
    />
  )
}
