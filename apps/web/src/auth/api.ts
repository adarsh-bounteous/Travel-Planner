export type AuthErrorCode =
  | 'wrong_password'
  | 'no_account'
  | 'email_not_confirmed'
  | 'password_rule'
  | 'could_not_create'
  | 'not_available'
  | 'invalid_email'
  | 'email_unavailable'
  | 'link_expired'
  | 'link_already_used'
  | 'link_invalid'
  | 'unknown'

export class AuthError extends Error {
  readonly code: AuthErrorCode
  constructor(code: AuthErrorCode) {
    super(code)
    this.code = code
  }
}

const KNOWN_CODES: AuthErrorCode[] = [
  'wrong_password',
  'no_account',
  'email_not_confirmed',
  'password_rule',
  'could_not_create',
  'not_available',
  'invalid_email',
  'email_unavailable',
  'link_expired',
  'link_already_used',
  'link_invalid',
]

async function post(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.ok) return response
  const data = await response.json().catch(() => ({}))
  const code = KNOWN_CODES.find((known) => known === data.code)
  throw new AuthError(code ?? 'unknown')
}

export type SignInMethod = 'email' | 'google'

export const requestEmailChange = (currentPassword: string, newEmail: string) =>
  post('/auth/account/email', { current_password: currentPassword, new_email: newEmail })

export const requestPasswordChange = (currentPassword: string, newPassword: string) =>
  post('/auth/account/password', { current_password: currentPassword, new_password: newPassword })

export async function fetchMe(): Promise<{ email: string; method: SignInMethod } | null> {
  const response = await fetch('/auth/me', { credentials: 'same-origin' })
  return response.ok ? response.json() : null
}

export type DemoAccount = { email: string; password: string }

/** The demo sign-in details the API offers in local mode; null when none, or when the call fails. */
export async function fetchDemoAccount(): Promise<DemoAccount | null> {
  try {
    const response = await fetch('/startup-status', { credentials: 'same-origin' })
    if (!response.ok) return null
    const body = await response.json()
    return body.demo_account ?? null
  } catch {
    return null
  }
}

/** Whether the API is running with local sign-in on; false when it says no, or when the call fails. */
export async function fetchLocalMode(): Promise<boolean> {
  try {
    const response = await fetch('/startup-status', { credentials: 'same-origin' })
    if (!response.ok) return false
    const body = await response.json()
    return body.local_mode === true
  } catch {
    return false
  }
}

export const requestResetLocalData = () => post('/local/reset', undefined, { 'X-Local-Reset': '1' })

export const requestSignIn = (email: string, password: string) =>
  post('/auth/sign-in', { email, password })

export const requestSignUp = (email: string, password: string) =>
  post('/auth/sign-up', { email, password })

export const requestSignOut = () => post('/auth/sign-out')

export type ConfirmedLink = { status: 'confirmed'; kind: 'sign_up' | 'email_change' }

export const requestConfirmLink = async (token: string): Promise<ConfirmedLink> =>
  (await post('/auth/confirm', { token })).json()

export const requestResend = (email: string) => post('/auth/resend-confirmation', { email })

export type GoogleMode = 'in' | 'up'

export function startGoogle(mode: GoogleMode) {
  window.location.assign(`/auth/google/start?mode=${mode}`)
}

export type GoogleIdentity = { email: string; has_account: boolean }

/** The identities the local consent page offers; empty when local mode is off or the call fails. */
export async function fetchGoogleIdentities(): Promise<GoogleIdentity[]> {
  try {
    const response = await fetch('/local/google-identities', { credentials: 'same-origin' })
    if (!response.ok) return []
    return (await response.json()).identities ?? []
  } catch {
    return []
  }
}

/** Finish the local Google flow through the real callback, so the API still checks state and sets the session. */
export function finishGoogle(state: string, outcome: { email: string } | 'cancel') {
  const params =
    outcome === 'cancel'
      ? new URLSearchParams({ state, error: 'access_denied' })
      : new URLSearchParams({ state, code: outcome.email })
  window.location.assign(`/auth/google/callback?${params}`)
}
