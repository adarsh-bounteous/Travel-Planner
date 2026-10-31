import { ArrowRightIcon } from '../auth/icons'

/** A decorative line a plane travels along; it carries no text, so screen readers skip it. */
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
