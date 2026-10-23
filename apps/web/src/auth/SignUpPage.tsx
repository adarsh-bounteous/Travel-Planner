import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AuthError } from './api'
import { AuthForm } from './AuthForm'
import { useAuth } from './AuthProvider'
import type { Problem } from './messages'

const HINT = 'At least 12 characters, with a letter and a number.'

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  const submit = async (address: string, password: string) => {
    setPending(true)
    setProblem(null)
    try {
      await signUp(address, password)
      navigate('/confirm-email')
    } catch (error) {
      setProblem(error instanceof AuthError ? error.code : 'unknown')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthForm
      mode="up"
      title="Create account"
      primaryLabel="Create account"
      googleLabel="Sign up with Google"
      passwordPlaceholder="At least 12 characters, with a letter and a number"
      passwordHint={HINT}
      footer={{ prompt: 'Already have an account?', linkLabel: 'Sign in', to: '/sign-in' }}
      problem={problem}
      email={email}
      onEmailChange={setEmail}
      pending={pending}
      onSubmit={submit}
    />
  )
}
