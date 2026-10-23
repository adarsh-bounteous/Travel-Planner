import { Route, Routes } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { ConfirmEmailPage } from './auth/ConfirmEmailPage'
import { HomePage } from './auth/HomePage'
import { SignInPage } from './auth/SignInPage'
import { SignUpPage } from './auth/SignUpPage'

// Until the signed-out redirect story lands, `/` shows sign-in when signed out.
function Home() {
  const { status } = useAuth()
  if (status === 'loading') return <span className="spinner" role="status" aria-label="Loading" />
  return status === 'signedIn' ? <HomePage /> : <SignInPage />
}

export default function App() {
  return (
    <main className="shell-main">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailPage />} />
      </Routes>
    </main>
  )
}
