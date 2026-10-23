export type AuthErrorCode =
  | 'wrong_password'
  | 'no_account'
  | 'email_not_confirmed'
  | 'password_rule'
  | 'could_not_create'
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
]

async function post(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.ok) return response
  const data = await response.json().catch(() => ({}))
  const code = KNOWN_CODES.find((known) => known === data.code)
  throw new AuthError(code ?? 'unknown')
}

export async function fetchMe(): Promise<{ email: string } | null> {
  const response = await fetch('/auth/me', { credentials: 'same-origin' })
  return response.ok ? response.json() : null
}

export const requestSignIn = (email: string, password: string) =>
  post('/auth/sign-in', { email, password })

export const requestSignUp = (email: string, password: string) =>
  post('/auth/sign-up', { email, password })

export const requestSignOut = () => post('/auth/sign-out')

export const requestResend = (email: string) => post('/auth/resend-confirmation', { email })

export type GoogleMode = 'in' | 'up'

export function startGoogle(mode: GoogleMode) {
  window.location.assign(`/auth/google/start?mode=${mode}`)
}
