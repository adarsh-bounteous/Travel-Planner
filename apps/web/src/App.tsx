import { Route, Routes } from 'react-router'
import { AccountPage } from './account/AccountPage'
import { AppHeader } from './AppHeader'
import { ConfirmEmailPage } from './auth/ConfirmEmailPage'
import { HomePage } from './auth/HomePage'
import { RequireAuth } from './auth/RequireAuth'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'
import { DestinationResultsPage } from './places/DestinationResultsPage'
import { ProfilePage } from './profile/ProfilePage'
import { InvitePage } from './trips/InvitePage'
import { SharedTripPage } from './trips/SharedTripPage'
import { TripPage } from './trips/TripPage'

// Every page other than the auth pages must be wrapped in <RequireAuth>, except two:
// the invite page names the email to sign in with while signed out, and the server checks the
// session on accept; the read-only trip page is for people with no account, and its link is the
// credential.
export default function App() {
  return (
    <>
      <AppHeader />
      <main className="shell-main">
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/destinations"
            element={
              <RequireAuth>
                <DestinationResultsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/new"
            element={
              <RequireAuth>
                <TripPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId"
            element={
              <RequireAuth>
                <TripPage />
              </RequireAuth>
            }
          />
          <Route path="/trips/read-only/:token" element={<SharedTripPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/confirm-email" element={<ConfirmEmailPage />} />
        </Routes>
      </main>
    </>
  )
}
