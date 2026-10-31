import { useCallback, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Toast } from '../trips/Toast'
import { AuthError, fetchDemoAccount, requestResend } from './api'
import type { DemoAccount } from './api'
import { AuthForm } from './AuthForm'
import { useAuth } from './AuthProvider'
import { GoogleNoAccountModal } from './GoogleNoAccountModal'
import { BrandLogo } from '../components/BrandLogo'
import { InfoIcon } from './icons'
import { pageLabel, peekReturnTo } from './returnTo'
import type { Problem } from './messages'

export function SignInPage() {
  const { status, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const localReset = (useLocation().state as { localReset?: boolean } | null)?.localReset === true
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [resent, setResent] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(
    params.get('error') === 'google_cancelled' ? 'google_cancelled' : null,
  )
  const [notLinked, setNotLinked] = useState(params.get('error') === 'google_not_linked')

  // After "Reset local data" the old session is gone on the server; drop it here too.
  useEffect(() => {
    if (localReset && status === 'signedIn') void signOut().catch(() => undefined)
  }, [localReset, status, signOut])

  const [demo, setDemo] = useState<DemoAccount | null>(null)
  useEffect(() => {
    let current = true
    void fetchDemoAccount().then((account) => current && setDemo(account))
    return () => {
      current = false
    }
  }, [])

  const closeModal =useCallback(() => {
    setNotLinked(false)
    setParams({}, { replace: true })
  }, [setParams])
  const goToSignUp = useCallback(() => navigate('/sign-up'), [navigate])

  // The destination's RequireAuth clears the remembered path once it has been reached.
  const returnTo = peekReturnTo()
  if (status === 'signedIn' && !localReset) return <Navigate to={returnTo ?? '/'} replace />

  const submit = async (address: string, password: string) => {
    setPending(true)
    setProblem(null)
    setResent(false)
    try {
      // Signing in flips status to signedIn, which redirects above.
      await signIn(address, password)
    } catch (error) {
      setProblem(error instanceof AuthError ? error.code : 'unknown')
    } finally {
      setPending(false)
    }
  }

  const resend = async () => {
    await requestResend(email.trim()).catch(() => undefined)
    setResent(true)
  }

  return (
    <>
      {localReset && <Toast message="Local data reset. Sign in with the demo user." />}
      <div className="auth-split">
      <aside className="auth-brand">
        <BrandLogo size="lg" inverse />
      </aside>
      <AuthForm
        mode="in"
        title="Sign in"
        primaryLabel="Sign in"
        googleLabel="Continue with Google"
        passwordPlaceholder="Password"
        noSignUp={returnTo?.startsWith('/invite/')}
        footer={{ prompt: 'No account?', linkLabel: 'Sign up', to: '/sign-up' }}
        problem={problem}
        email={email}
        onEmailChange={setEmail}
        pending={pending}
        onSubmit={submit}
        onResend={resend}
        resent={resent}
        notice={(fillPassword) => (
          <>
            {returnTo && (
              <p className="alert alert-info cluster" role="status">
                <InfoIcon />
                <span>
                  You'll go to <strong>{pageLabel(returnTo)}</strong> after signing in.
                </span>
              </p>
            )}
            {demo && (
              <div className="alert alert-info stack stack-sm" role="status">
                <p className="alert-title">Demo account is ready</p>
                <p className="text-sm">
                  Email <code>{demo.email}</code> and password <code>{demo.password}</code>
                </p>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => {
                    setEmail(demo.email)
                    fillPassword(demo.password)
                  }}
                >
                  Fill in demo details
                </button>
              </div>
            )}
          </>
        )}
      />
      </div>
      {notLinked && <GoogleNoAccountModal onSignUp={goToSignUp} onCancel={closeModal} />}
    </>
  )
}
