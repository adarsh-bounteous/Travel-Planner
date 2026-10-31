import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { AlertIcon, SearchIcon, SuitcaseIcon } from './auth/icons'
import { EmptyStateArt } from './components/EmptyStateArt'
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
        <EmptyStateArt />
        <span className="nf-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <span className="badge badge-neutral">
          <AlertIcon />
          404 Not Found
        </span>
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
