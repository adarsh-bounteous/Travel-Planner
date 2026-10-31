import { ArrowRightIcon } from '../auth/icons'

/** A decorative line that draws itself with a plane at the end; it carries no text. */
export function RouteLine() {
  return (
    <div className="route is-playing" aria-hidden="true">
      <span className="route-track">
        <span className="route-line" />
        <span className="route-plane">
          <ArrowRightIcon />
        </span>
      </span>
    </div>
  )
}
