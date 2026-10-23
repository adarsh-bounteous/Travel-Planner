import { useCallback, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { AuthError, requestResend } from './api'
import { AuthForm } from './AuthForm'
import { useAuth } from './AuthProvider'
import { GoogleNoAccountModal } from './GoogleNoAccountModal'
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

  if (status === 'signedIn') return <Navigate to="/" replace />

  const submit = async (address: string, password: string) => {
    setPending(true)
    setProblem(null)
    setResent(false)
    try {
      await signIn(address, password)
      navigate('/', { replace: true })
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
        footer={{ prompt: 'No account?', linkLabel: 'Sign up', to: '/sign-up' }}
        problem={problem}
        email={email}
        onEmailChange={setEmail}
        pending={pending}
        onSubmit={submit}
        onResend={resend}
        resent={resent}
      />
      {notLinked && <GoogleNoAccountModal onSignUp={goToSignUp} onCancel={closeModal} />}
    </>
  )
}
