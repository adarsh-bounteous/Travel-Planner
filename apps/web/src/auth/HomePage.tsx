import { useNavigate } from 'react-router'
import { MyTripsPage } from '../trips/MyTripsPage'
import { useAuth } from './AuthProvider'

export function HomePage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in')
  }

  return (
    <div className="stack">
      <MyTripsPage />
      <p className="text-sm text-muted">
        You'll stay signed in on this device until you sign out or go 7 days without opening
        Travel Planner.
      </p>
      <div>
        <button className="btn btn-ghost" type="button" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
