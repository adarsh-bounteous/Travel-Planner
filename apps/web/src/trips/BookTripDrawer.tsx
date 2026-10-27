import { InfoIcon } from '../auth/icons'
import type { ChosenOption, ChosenSim } from './api'
import { formatDay } from './ItineraryTab'
import { Overlay } from './Overlay'
import { safeHref } from './safeHref'

function BookLink({ href }: { href: string | null }) {
  return href ? (
    <a className="btn btn-secondary" href={href} target="_blank" rel="noopener noreferrer">
      Open booking page<span className="text-sm"> (opens in a new tab)</span>
    </a>
  ) : (
    <p className="text-sm">
      <InfoIcon /> No booking link is available for this option.
    </p>
  )
}

/** Booking links for the chosen options and the picked SIM. Booking itself happens on the provider's site. */
export function BookTripDrawer({
  options,
  sim,
  onClose,
}: {
  options: ChosenOption[]
  sim?: ChosenSim | null
  onClose: () => void
}) {
  const sorted = [...options].sort((a, b) => a.date.localeCompare(b.date))
  const count = options.length + (sim ? 1 : 0)

  return (
    <Overlay kind="drawer" labelledBy="book-title" onClose={onClose}>
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          <h2 id="book-title">Book trip</h2>
          <p className="text-muted">
            {count} chosen {count === 1 ? 'option' : 'options'}. Each link opens the provider's
            site in a new tab.
          </p>
        </div>
        <ul className="link-list">
          {sorted.map((option) => (
            <li key={option.id} className="card stack stack-sm">
              <div>
                <div className="option-title">{option.title}</div>
                <div className="text-sm text-muted">
                  {option.category}, {formatDay(option.date)}
                </div>
              </div>
              <BookLink href={safeHref(option.booking_url)} />
            </li>
          ))}
          {sim && (
            <li className="card stack stack-sm">
              <div className="option-title">{`SIM: ${sim.name}`}</div>
              <BookLink href={safeHref(sim.url)} />
            </li>
          )}
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
