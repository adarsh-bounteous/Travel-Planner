import type { AuthErrorCode } from './api'

export type Problem = AuthErrorCode | 'google_cancelled'

export type Message = { tone: 'danger' | 'warning'; text: string }

/** The approved copy, keyed by API error code. */
export const MESSAGES: Record<Problem, Message> = {
  wrong_password: { tone: 'danger', text: 'Password did not match. Try again.' },
  no_account: { tone: 'danger', text: 'No account exists for that email.' },
  email_not_confirmed: {
    tone: 'warning',
    text: 'Confirm your email address before signing in.',
  },
  google_cancelled: {
    tone: 'warning',
    text: 'Sign-in with Google was cancelled. Try again or sign in with email and password.',
  },
  password_rule: {
    tone: 'danger',
    text: 'Password needs at least 12 characters, with a letter and a number.',
  },
  could_not_create: {
    tone: 'danger',
    text: 'We could not create an account with that email. Try signing in.',
  },
  not_available: { tone: 'danger', text: 'This change is not available for your account.' },
  invalid_email: { tone: 'danger', text: 'Enter a valid email address.' },
  email_unavailable: {
    tone: 'danger',
    text: "This email address can't be used. Enter a different email address.",
  },
  link_expired: { tone: 'danger', text: 'This confirmation link has expired. Request a new one.' },
  link_already_used: {
    tone: 'danger',
    text: 'This confirmation link has already been used. Sign in instead.',
  },
  link_invalid: { tone: 'danger', text: 'This confirmation link is not valid.' },
  unknown: { tone: 'danger', text: 'Something went wrong. Try again.' },
}
