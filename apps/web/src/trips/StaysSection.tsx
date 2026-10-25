import { AlertIcon, HomeIcon, PlusIcon } from '../auth/icons'
import type { Stay } from './api'
import { formatRange, nights, sortStays, warningFor } from './stays'

type StaysSectionProps = {
  stays: Stay[]
  canEdit: boolean
  onAdd: () => void
  onEdit: (stay: Stay) => void
  onRemove: (stay: Stay) => void
}

/** The trip's stays in date order, each with its dates; a stay that overlaps or leaves a gap carries a badge. */
export function StaysSection({ stays, canEdit, onAdd, onEdit, onRemove }: StaysSectionProps) {
  return (
    <section className="stack" aria-labelledby="stays-heading">
      <div className="title-row">
        <h2 id="stays-heading">Stays</h2>
        {canEdit && (
          <button className="btn btn-primary" type="button" onClick={onAdd}>
            <PlusIcon />
            Add stay
          </button>
        )}
      </div>
      {stays.length === 0 ? (
        <div className="empty-state">
          <HomeIcon />
          <p>No stays yet. Add a place and dates for this trip.</p>
        </div>
      ) : (
        sortStays(stays).map((stay) => {
          const warning = warningFor(stay, stays)
          const count = nights(stay)
          return (
            <div key={stay.id} className="card">
              <div className="row-between">
                <div>
                  <div className="stay-place">{stay.place}</div>
                  <div className="text-muted">
                    {formatRange(stay.start_date, stay.end_date)}{' '}
                    <span className="text-sm">{`(${count} ${count === 1 ? 'night' : 'nights'})`}</span>
                  </div>
                  {warning && (
                    <div className="stay-flags">
                      <span className="badge badge-warning">
                        <AlertIcon />
                        {warning.kind === 'overlap' ? `Overlaps ${warning.other.place}` : 'Gap next to this stay'}
                      </span>
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="cluster">
                    <button className="btn btn-secondary" type="button" onClick={() => onEdit(stay)}>
                      Edit stay
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => onRemove(stay)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
