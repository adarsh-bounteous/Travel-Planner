import { useCallback, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { AuthError, requestResend } from './api'
import { AuthForm } from './AuthForm'
import { useAuth } from './AuthProvider'
import { GoogleNoAccountModal } from './GoogleNoAccountModal'
import { InfoIcon } from './icons'
import { pageLabel, peekReturnTo } from './returnTo'
import type { Problem } from './messages'

export function SignInPage() {
  const { status, signIn } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [resent, setResent] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(
    params.get('error') === 'google_cancelled' ? 'google_cancelled' : null,
  )
  const [notLinked, setNotLinked] = useState(params.get('error') === 'google_not_linked')

  const closeModal = useCallback(() => {
    setNotLinked(false)
    setParams({}, { replace: true })
  }, [setParams])
  const goToSignUp = useCallback(() => navigate('/sign-up'), [navigate])

  // The destination's RequireAuth clears the remembered path once it has been reached.
  const returnTo = peekReturnTo()
  if (status === 'signedIn') return <Navigate to={returnTo ?? '/'} replace />

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
        notice={
          returnTo && (
            <p className="alert alert-info cluster" role="status">
              <InfoIcon />
              <span>
                You'll go to <strong>{pageLabel(returnTo)}</strong> after signing in.
              </span>
            </p>
          )
        }
      />
      {notLinked && <GoogleNoAccountModal onSignUp={goToSignUp} onCancel={closeModal} />}
    </>
  )
}
