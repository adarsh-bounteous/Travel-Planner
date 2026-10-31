import { Link, NavLink, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { BrandLogo } from './components/BrandLogo'
import { MAIN_SECTIONS, mainSectionFor } from './navSections'

// Top bar: logo, main sections, then utility links. Never collapses behind a menu button.
export function AppHeader() {
  const { status } = useAuth()
  const { pathname } = useLocation()
  const current = mainSectionFor(pathname)
  return (
    <header className="shell-header">
      <div className="shell-bar">
        <Link className="shell-brand" to="/">
          <BrandLogo />
        </Link>
        {status === 'signedIn' && (
          <nav className="shell-nav" aria-label="Main">
            <ul>
              {MAIN_SECTIONS.map((section) => (
                <li key={section.id}>
                  <Link
                    className="shell-link"
                    to={section.to}
                    aria-current={current === section.id ? 'page' : undefined}
                  >
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="shell-nav-utility">
              <li>
                <NavLink className="shell-link" to="/saved">
                  Saved
                </NavLink>
              </li>
              <li>
                <NavLink className="shell-link" to="/account">
                  Account
                </NavLink>
              </li>
            </ul>
          </nav>
        )}
        {status === 'signedOut' && (
          <Link className="btn btn-secondary" to="/sign-in">
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
