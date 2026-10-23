import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchMe, requestSignIn, requestSignOut, requestSignUp } from './api'
import type { SignInMethod } from './api'

type Status = 'loading' | 'signedIn' | 'signedOut'

type AuthContextValue = {
  status: Status
  email: string | null
  method: SignInMethod | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [method, setMethod] = useState<SignInMethod | null>(null)

  const refresh = useCallback(async () => {
    const me = await fetchMe().catch(() => null)
    setEmail(me?.email ?? null)
    setMethod(me?.method ?? null)
    setStatus(me ? 'signedIn' : 'signedOut')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      email,
      method,
      signIn: async (address, password) => {
        await requestSignIn(address, password)
        await refresh()
      },
      // Sign-up never signs the traveller in; they confirm their email first.
      signUp: async (address, password) => {
        await requestSignUp(address, password)
      },
      signOut: async () => {
        await requestSignOut()
        setEmail(null)
        setMethod(null)
        setStatus('signedOut')
      },
    }),
    [status, email, method, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
