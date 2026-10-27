import { Route, Routes } from 'react-router'
import { AccountPage } from './account/AccountPage'
import { LocalModePage } from './account/LocalModePage'
import { LocalBookingPage } from './travel/LocalBookingPage'
import { TravelSearchPage } from './travel/TravelSearchPage'
import { AppHeader } from './AppHeader'
import { ConfirmEmailPage } from './auth/ConfirmEmailPage'
import { ConfirmLinkPage } from './auth/ConfirmLinkPage'
import { HomePage } from './auth/HomePage'
import { RequireAuth } from './auth/RequireAuth'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'
import { ExplorePage } from './explore/ExplorePage'
import { LocalInboxPage } from './local/LocalInboxPage'
import { AddPlaceNoTripsPage } from './places/AddPlaceNoTripsPage'
import { DestinationResultsPage } from './places/DestinationResultsPage'
import { ProfilePage } from './profile/ProfilePage'
import { TransportPreferencesPage } from './profile/TransportPreferencesPage'
import { SavedPage } from './saved/SavedPage'
import { TransportSearchPage } from './transport/TransportSearchPage'
import { CostsPage } from './trips/CostsPage'
import { CurrencyHelperPage } from './trips/CurrencyHelperPage'
import { WeatherHelperPage } from './trips/WeatherHelperPage'
import { InvitePage } from './trips/InvitePage'
import { StayOptionsPage } from './trips/StayOptionsPage'
import { FlightShortlistPage } from './trips/FlightShortlistPage'
import { StayShortlistPage } from './trips/StayShortlistPage'
import { SharedTripPage } from './trips/SharedTripPage'
import { ShortlistsPage } from './trips/ShortlistsPage'
import { TripRequirementsPage } from './trips/TripRequirementsPage'
import { TripPage } from './trips/TripPage'

// Every page other than the auth pages must be wrapped in <RequireAuth>, except four:
// the invite page names the email to sign in with while signed out, and the server checks the
// session on accept; the read-only trip page is for people with no account, and its link is the
// credential; Destination results browses the read-only catalogue, and a signed-out visitor who
// chooses Save is sent to sign in (see useSavedPlaces); the local inbox lists the emails local
// mode would have sent, and its API route answers 404 unless local mode is on.
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
            element={<DestinationResultsPage />}
          />
          <Route
            path="/explore"
            element={
              <RequireAuth>
                <ExplorePage />
              </RequireAuth>
            }
          />
          <Route
            path="/explore/travel"
            element={
              <RequireAuth>
                <TravelSearchPage />
              </RequireAuth>
            }
          />
          <Route
            path="/explore/travel/booking"
            element={
              <RequireAuth>
                <LocalBookingPage />
              </RequireAuth>
            }
          />
          <Route
            path="/account/local-mode"
            element={
              <RequireAuth>
                <LocalModePage />
              </RequireAuth>
            }
          />
          <Route
            path="/saved"
            element={
              <RequireAuth>
                <SavedPage />
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
            path="/profile/transport"
            element={
              <RequireAuth>
                <TransportPreferencesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/transport"
            element={
              <RequireAuth>
                <TransportSearchPage />
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
            path="/trips/:tripId/currency"
            element={
              <RequireAuth>
                <CurrencyHelperPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId/weather"
            element={
              <RequireAuth>
                <WeatherHelperPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId/requirements"
            element={
              <RequireAuth>
                <TripRequirementsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId/shortlists"
            element={
              <RequireAuth>
                <ShortlistsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId/costs"
            element={
              <RequireAuth>
                <CostsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/places/add"
            element={
              <RequireAuth>
                <AddPlaceNoTripsPage />
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
          <Route
            path="/trips/:tripId/stays/:stayId/options"
            element={
              <RequireAuth>
                <StayOptionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId/stays/:stayId/shortlist"
            element={
              <RequireAuth>
                <StayShortlistPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips/:tripId/flights"
            element={
              <RequireAuth>
                <FlightShortlistPage />
              </RequireAuth>
            }
          />
          <Route path="/trips/read-only/:token" element={<SharedTripPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/local/inbox" element={<LocalInboxPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/confirm-email" element={<ConfirmEmailPage />} />
          <Route path="/confirm-email/:token" element={<ConfirmLinkPage />} />
        </Routes>
      </main>
    </>
  )
}
