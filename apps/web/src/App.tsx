import { Route, Routes } from 'react-router'
import { AppHeader } from './AppHeader'
import { ConfirmEmailPage } from './auth/ConfirmEmailPage'
import { HomePage } from './auth/HomePage'
import { RequireAuth } from './auth/RequireAuth'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'

// Every page other than the auth pages must be wrapped in <RequireAuth>.
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
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/confirm-email" element={<ConfirmEmailPage />} />
        </Routes>
      </main>
    </>
  )
}
