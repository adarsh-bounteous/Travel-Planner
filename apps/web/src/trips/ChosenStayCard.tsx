import { CheckIcon } from '../auth/icons'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { BookingLink, isLocalBooking } from '../travel/BookingLink'
import type { ChosenStay } from './api'
import { formatMoney } from './stayOptions'

type Props = {
  chosen: ChosenStay | null
  canEdit: boolean
  onChange: () => void
  onClear: () => void
}

/** The stay chosen for a date range, with the provider's booking link; booking itself happens on their site. */
export function ChosenStayCard({ chosen, canEdit, onChange, onClear }: Props) {
  return (
    <section className="card chosen-card stack" aria-label="Chosen stay" aria-live="polite">
      {chosen ? (
        <>
          <span className="badge badge-success">
            <CheckIcon />
            Chosen
          </span>
          <h3>{chosen.name}</h3>
          <p>
            Cost for these dates: <span className="stay-total">{formatMoney(chosen.total, chosen.currency)}</span>
          </p>
          <p className="text-sm text-muted">
            {`Final price confirmed on provider's site. You book with ${chosen.provider}; nothing is paid in the app.`}
          </p>
          <div className="cluster">
            {(/^https?:\/\//i.test(chosen.url) || isLocalBooking(chosen.url)) && (
              <BookingLink className="btn btn-primary" url={chosen.url}>
                Book on provider site
                <span className="sr-only"> (opens in a new tab)</span>
              </BookingLink>
            )}
            {canEdit && (
              <>
                <button className="btn btn-secondary" type="button" onClick={onChange}>
                  Change stay
                </button>
                <button className="btn btn-ghost" type="button" onClick={onClear}>
                  Clear chosen stay
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">
        <EmptyStateArt />
          <h3>No stay chosen yet</h3>
          <p className="text-muted">
            Pick one from the shortlist below to see its booking link and add it to your itinerary.
          </p>
        </div>
      )}
    </section>
  )
}
