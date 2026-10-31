import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { SearchIcon, SuitcaseIcon } from './auth/icons'

export function NotFoundPage() {
  const { pathname, search } = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="nf">
      <div className="empty-state">
        <span className="nf-icon" aria-hidden="true">
          <SearchIcon />
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
          <SuitcaseIcon />
          Go to Trips
        </Link>
      </div>
    </div>
  )
}
