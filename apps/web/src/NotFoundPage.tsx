import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { BrandLogo } from './components/BrandLogo'

export function NotFoundPage() {
  const { pathname, search } = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="nf">
      <Link className="nf-brand" to="/" aria-label="Travel Planner">
        <BrandLogo size="lg" />
      </Link>
      <div className="empty-state">
        <span className="nf-icon" aria-hidden="true">
          <svg className="icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <span className="badge badge-neutral">404 Not Found</span>
        <h1 ref={heading} tabIndex={-1}>
          Page not found
        </h1>
        <p>The page you requested could not be found.</p>
        <code className="nf-path text-muted" aria-label="Requested address">
          {pathname + search}
        </code>
        <Link className="btn btn-primary" to="/">
          Go to Trips
        </Link>
      </div>
    </div>
  )
}
