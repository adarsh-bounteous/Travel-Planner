import { useNavigate } from 'react-router'
import { useAuth } from './AuthProvider'

export function HomePage() {
  const { email, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in')
  }

  return (
    <div className="stack">
      <h1>Your trips</h1>
      <p>
        Welcome, {email}. You haven't planned a trip yet. When you do, it will show up here on
        every device you sign in from.
      </p>
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
