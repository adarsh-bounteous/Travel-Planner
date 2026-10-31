import { useState } from 'react'
import { ArrowRightIcon, ListIcon } from './icons'
import { useNavigate } from 'react-router'
import { LocalMenu } from '../local/LocalMenu'
import { DestinationSearch } from '../places/DestinationSearch'
import { MyTripsPage } from '../trips/MyTripsPage'
import { useAuth } from './AuthProvider'

export function HomePage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in')
  }

  return (
    <div className="stack">
      <div className="overlay-actions end">
        <button className="btn btn-ghost" type="button" onClick={() => setMenuOpen(true)}>
          <ListIcon />
          Menu
        </button>
      </div>
      {menuOpen && <LocalMenu onClose={() => setMenuOpen(false)} />}
      <section className="stack">
        <h1>Where to next?</h1>
        <DestinationSearch />
      </section>
      <MyTripsPage />
      <p className="text-sm text-muted">
        You'll stay signed in on this device until you sign out or go 7 days without opening
        Travel Planner.
      </p>
      <div>
        <button className="btn btn-ghost" type="button" onClick={handleSignOut}>
          <ArrowRightIcon />
          Sign out
        </button>
      </div>
    </div>
  )
}
