import type { Profile } from '../trips/api'
import { REQUIRED_QUESTIONS, SELECT_QUESTIONS } from '../trips/profileQuestions'
import type { ProfileQuestionKey } from '../trips/profileQuestions'

export const PROFILE_ORDER: ProfileQuestionKey[] = [
  'citizenship',
  'residence',
  'health_status',
  'religion',
  'diet',
  'tastes',
  'travel_style',
]

export const isRequired = (key: ProfileQuestionKey) =>
  (REQUIRED_QUESTIONS as readonly string[]).includes(key)

export const labelOf = (key: ProfileQuestionKey) =>
  key === 'tastes' ? 'Tastes' : SELECT_QUESTIONS[key].label

/** The saved answer as text; empty when not given. */
export const answerText = (profile: Profile, key: ProfileQuestionKey): string => {
  const value = profile[key] as string | string[] | undefined
  return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

const isEmpty = (value: string | string[]) => (Array.isArray(value) ? value.length === 0 : !value)

/** Why this answer can't be saved, if it can't. Citizenship and residence are never saved empty. */
export const answerError = (
  key: ProfileQuestionKey,
  value: string | string[],
  mode: 'edit' | 'add' = 'edit',
): string | undefined => {
  if (!isEmpty(value)) return undefined
  if (isRequired(key)) return `${labelOf(key)} is required. Choose one to save.`
  if (mode === 'add') return key === 'tastes' ? 'Choose at least one taste to save.' : 'Choose one to save.'
  return undefined
}

/** The whole profile with one answer changed: `PUT /profile` replaces it, so nothing else may be lost. */
export const withAnswer = (
  profile: Profile,
  key: ProfileQuestionKey,
  value: string | string[],
): Profile => ({ ...profile, [key]: value })
