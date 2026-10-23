import { InfoIcon } from '../auth/icons'
import type { ChosenOption } from './api'
import { formatDay } from './ItineraryTab'
import { Overlay } from './Overlay'

/** Only http(s) pages are opened, so a stored `javascript:` URL can never become a link. */
function bookingHref(option: ChosenOption) {
  if (!option.booking_url) return null
  try {
    const { protocol } = new URL(option.booking_url)
    return protocol === 'http:' || protocol === 'https:' ? option.booking_url : null
  } catch {
    return null
  }
}

/** Booking links for the chosen options. Booking itself happens on the provider's site. */
export function BookTripDrawer({
  options,
  onClose,
}: {
  options: ChosenOption[]
  onClose: () => void
}) {
  const sorted = [...options].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Overlay kind="drawer" labelledBy="book-title" onClose={onClose}>
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          <h2 id="book-title">Book trip</h2>
          <p className="text-muted">
            {options.length} chosen {options.length === 1 ? 'option' : 'options'}. Each link opens
            the provider's site in a new tab.
          </p>
        </div>
        <ul className="link-list">
          {sorted.map((option) => {
            const href = bookingHref(option)
            return (
              <li key={option.id} className="card stack stack-sm">
                <div>
                  <div className="option-title">{option.title}</div>
                  <div className="text-sm text-muted">
                    {option.category}, {formatDay(option.date)}
                  </div>
                </div>
                {href ? (
                  <a
                    className="btn btn-secondary"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open booking page<span className="text-sm"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <p className="text-sm">
                    <InfoIcon /> No booking link is available for this option.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <p className="text-sm text-muted">
          You book and pay on the provider's site. Travel planner doesn't take payment or confirm
          bookings.
        </p>
        <div className="overlay-actions end">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
